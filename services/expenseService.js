const mongoose = require("mongoose");
require("dotenv").config();
const axios = require("axios");
const cron = require("node-cron");
const Expense = require("../models/Expense");
const Group = require("../models/Group");
const User = require("../models/User");
const { calculateSplitDetails } = require("../utils/splitCalculator");
const Transaction = require("../models/Transaction");

// Model for storing exchange rates
const exchangeRateSchema = new mongoose.Schema({
  baseCurrency: String,
  rates: Object,
  timestamp: Date,
});

const ExchangeRate = mongoose.model("ExchangeRate", exchangeRateSchema);

// Utility function to fetch and store exchange rates
const fetchAndStoreExchangeRates = async (forceUpdate = false) => {
  try {
    const API_KEY = process.env.EXCHANGERATES_API_KEY;
    if (!API_KEY) {
      throw new Error("ExchangeRate-API key is missing in .env file");
    }
    const BASE_CURRENCY = process.env.BASE_CURRENCY || "INR";
    const exchangeRatesUrl = `https://api.apilayer.com/exchangerates_data/latest?access_key=${API_KEY}&base=${BASE_CURRENCY}`;

    //console.log("Fetching exchange rates from:", exchangeRatesUrl);
    const response = await axios.get(exchangeRatesUrl, {
      headers: { apikey: API_KEY },
    });
    const rates = response.data.rates;

    if (!rates || Object.keys(rates).length === 0) {
      throw new Error("No exchange rates returned from API");
    }

    // Store rates in MongoDB, but only if forceUpdate or no recent cache exists
    if (forceUpdate) {
      await ExchangeRate.deleteMany({ baseCurrency: BASE_CURRENCY }); // Clear cache if forcing update
    }

    await ExchangeRate.findOneAndUpdate(
      { baseCurrency: BASE_CURRENCY },
      { rates, timestamp: new Date() },
      { upsert: true, new: true }
    );

    //console.log("Exchange rates updated successfully:", rates);
    return rates;
  } catch (error) {
    console.error("Error fetching exchange rates:", error.message, error.stack);
    throw new Error(`Failed to fetch exchange rates: ${error.message}`);
  }
};

// Schedule cron job to run daily at midnight (00:00)
cron.schedule("0 0 * * *", async () => {
  //console.log("Running daily exchange rate update...");
  try {
    await fetchAndStoreExchangeRates(true); // Force update daily
  } catch (error) {
    console.error("Error in daily exchange rate update:", error);
  }
});

// NEW: Force update exchange rates endpoint
const updateExchangeRates = async (req, res) => {
  try {
    const updatedRates = await fetchAndStoreExchangeRates(true); // Force update
    res.status(200).json({
      message: "Exchange rates updated successfully",
      rates: updatedRates,
    });
  } catch (error) {
    console.error("Error updating exchange rates:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Updated createExpense with new fields & validations, using payeeId from payload
const createExpense = async (req, res) => {
  try {
    const {
      totalAmount,
      description,
      participants,
      splitMethod,
      groupId,
      splitValues,
      currency = "INR",
      type = "Miscellaneous",
      paymentMode = "UPI",
      payeeId, // Extract payeeId from the payload
    } = req.body;

    //console.log("Expense type:", type);
    //("Received payload:", JSON.stringify(req.body, null, 2)); // Log the full payload for debugging

    if (
      !totalAmount ||
      !description ||
      !participants ||
      participants.length < 2 ||
      !payeeId // Ensure payeeId is provided
    ) {
      return res.status(400).json({
        message:
          "Total amount, description, payee, and at least two participants are required.",
      });
    }
    if (description.length > 30) {
      return res.status(400).json({
        message: "Description must be 30 characters or less.",
      });
    }
    if (totalAmount <= 0) {
      return res.status(400).json({
        message: "Expense amount must be greater than zero.",
      });
    }

    // Use payeeId from payload as the payer, not req.user.id
    if (!mongoose.Types.ObjectId.isValid(payeeId)) {
      return res.status(400).json({ message: "Invalid payee ID format" });
    }
    const payerId = new mongoose.Types.ObjectId(payeeId);

    // Ensure the payer exists and is a valid user
    const payerUser = await User.findById(payerId);
    //console.log("Payer user found:", JSON.stringify(payerUser, null, 2)); // Debug payer
    if (!payerUser) {
      return res.status(400).json({ message: "Payee does not exist." });
    }

    // Convert participants to ObjectId & Validate (including payer if present, but ensuring at least one other participant)
    let participantsObjectIds = participants.map((id) => {
      //console.log("Validating participant ID:", id); // Debug each participant ID
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error(`Invalid participant ID: ${id}`);
      }
      return new mongoose.Types.ObjectId(id);
    });

    // console.log(
    //   "Participant ObjectIds:",
    //   JSON.stringify(participantsObjectIds, null, 2)
    // ); // Debug ObjectIds

    // Ensure all participants exist, including the payer if they are listed as a participant
    // First, check if payerId is in participants
    const isPayerInParticipants = participantsObjectIds.includes(payerId);
    const uniqueParticipants = [...new Set(participantsObjectIds)]; // Remove duplicates

    // Check if there are at least two unique participants (including or excluding payer, but ensuring at least one other)
    if (uniqueParticipants.length < 2) {
      return res.status(400).json({
        message:
          "At least two unique participants (including or excluding payer) are required.",
      });
    }

    // Fetch all unique participants, including payer if listed
    const existingUsers = await User.find({
      _id: { $in: uniqueParticipants },
    });
    // console.log(
    //   "Existing users found (including payer if listed):",
    //   JSON.stringify(existingUsers, null, 2)
    // ); // Debug existing users

    if (existingUsers.length !== uniqueParticipants.length) {
      const missingIds = uniqueParticipants.filter(
        (id) => !existingUsers.some((user) => user._id.equals(id))
      );
      // console.log(
      //   "Missing participant IDs:",
      //   JSON.stringify(missingIds, null, 2)
      // ); // Debug missing IDs
      return res
        .status(400)
        .json({ message: "One or more participants do not exist." });
    }

    // Validate group if provided
    let groupObjectId = null;
    if (groupId) {
      if (!mongoose.Types.ObjectId.isValid(groupId)) {
        return res.status(400).json({ message: "Invalid group ID format" });
      }
      groupObjectId = new mongoose.Types.ObjectId(groupId);
      const existingGroup = await Group.findById(groupObjectId);
      if (!existingGroup) {
        return res.status(400).json({ message: "Group not found." });
      }
    }

    // Prevent duplicate expenses (using payeeId instead of req.user.id)
    const existingExpense = await Expense.findOne({
      payer: payerId,
      totalAmount,
      description,
      splitMethod,
      participants: {
        $all: uniqueParticipants.filter((id) => !id.equals(payerId)), // Exclude payer for uniqueness check if not a participant
        $size: uniqueParticipants.length - (isPayerInParticipants ? 1 : 0),
      },
      groupId: groupObjectId || null,
    });
    if (existingExpense) {
      return res
        .status(400)
        .json({ message: "Duplicate expense already exists." });
    }

    // Generate split details for all participants, including payer if they are a participant
    let splitDetails = calculateSplitDetails(
      splitMethod,
      totalAmount,
      uniqueParticipants,
      splitValues
    );

    // console.log(
    //   "Generated split details:",
    //   JSON.stringify(splitDetails, null, 2)
    // ); // Debug split details

    // Ensure splitDetails includes only non-self transactions (payer to others)
    splitDetails = splitDetails.filter(
      (split) => !split.userId.equals(payerId)
    );

    // Create expense with the payee as the payer
    const newExpense = await Expense.create({
      payer: payerId,
      totalAmount,
      description,
      participants: uniqueParticipants.filter((id) => !id.equals(payerId)), // Exclude payer from participants
      splitMethod,
      splitDetails, // Includes only non-self transactions
      groupId: groupObjectId,
      currency,
      type,
    });

    // Create transactions, excluding self-transactions (payer to payer)
    const transactionPromises = splitDetails.map(async (split) => {
      return await Transaction.create({
        expenseId: newExpense._id,
        sender: split.userId,
        receiver: payerId,
        amount: split.amountOwed,
        currency,
        mode: paymentMode,
        status: "Pending",
      });
    });
    const transactions = await Promise.all(transactionPromises);

    res.status(201).json({
      message: "Expense added successfully with transactions",
      expense: newExpense,
      transactions,
    });
  } catch (error) {
    console.error("Error creating expense:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Fetch Expenses for a Specific Group
const getGroupExpenses = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group ID format" });
    }

    const expenses = await Expense.find({ groupId })
      .populate("payer", "fullName email")
      .populate("participants", "fullName email");

    if (!expenses.length) {
      return res
        .status(404)
        .json({ message: "No expenses found for this group." });
    }

    res.json({ message: "Expenses fetched successfully.", expenses });
  } catch (error) {
    console.error("Error fetching group expenses:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Fetch Expenses for Logged-in User
const getUserExpenses = async (req, res) => {
  try {
    const expenses = await Expense.find({ participants: req.user.id })
      .populate("payer", "fullName email")
      .populate("participants", "fullName email");

    res
      .status(200)
      .json({ message: "User expenses fetched successfully.", expenses });
  } catch (error) {
    console.error("Error fetching user expenses:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Fetch a Specific Expense by ID
const getExpenseById = async (req, res) => {
  try {
    const { expenseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(expenseId)) {
      return res.status(400).json({ message: "Invalid expense ID format" });
    }

    const expense = await Expense.findById(expenseId)
      .populate("payer", "fullName email")
      .populate("participants", "fullName email");

    if (!expense) {
      return res.status(404).json({ message: "Expense not found." });
    }

    res
      .status(200)
      .json({ message: "Expense details fetched successfully.", expense });
  } catch (error) {
    console.error("Error fetching expense:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Delete an Expense (Only Creator Can Delete)
const deleteExpense = async (req, res) => {
  try {
    const { expenseId } = req.params;
    const userId = req.user.id;

    // Validate Expense ID
    if (!mongoose.Types.ObjectId.isValid(expenseId)) {
      return res.status(400).json({ message: "Invalid expense ID format" });
    }

    // Find the expense
    const expense = await Expense.findById(expenseId);
    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    // ✅ Ensure only the expense payer (creator) can delete it
    if (expense.payer.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "You are not authorized to delete this expense." });
    }

    // ✅ Delete related transactions
    await Transaction.deleteMany({ expenseId });

    // ✅ Delete the expense
    await Expense.findByIdAndDelete(expenseId);

    res.status(200).json({ message: "Expense deleted successfully" });
  } catch (error) {
    console.error("Error deleting expense:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// NEW: Returns aggregated totals (total expenses, pending & settled) with currency conversion
const getExpenseSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // Find all groups where the user is a member
    const userGroups = await Group.find({ members: userId }).select("_id");
    const groupIds = userGroups.map((group) => group._id);

    // Find all expenses where the user is a participant or the expense belongs to one of the user's groups
    const expenses = await Expense.find({
      $or: [
        { participants: userId }, // User is a participant
        { groupId: { $in: groupIds } }, // Expense belongs to a group the user is in
      ],
    }).populate("participants", "fullName"); // Populate participant names for debugging

    if (!expenses || expenses.length === 0) {
      return res.status(200).json({
        message: "Expense summary fetched successfully",
        summary: {
          INR: { totalExpenses: 0, totalPending: 0, totalSettled: 0 },
          USD: { totalExpenses: 0, totalPending: 0, totalSettled: 0 },
          EUR: { totalExpenses: 0, totalPending: 0, totalSettled: 0 },
          GBP: { totalExpenses: 0, totalPending: 0, totalSettled: 0 },
          JPY: { totalExpenses: 0, totalPending: 0, totalSettled: 0 },
        },
      });
    }

    const BASE_CURRENCY = process.env.BASE_CURRENCY || "INR";
    const targetCurrencies = ["INR", "USD", "EUR", "GBP", "JPY"];

    // Fetch or retrieve cached exchange rates
    let exchangeRates;
    const cachedRate = await ExchangeRate.findOne({
      baseCurrency: BASE_CURRENCY,
    });
    if (cachedRate && new Date() - cachedRate.timestamp < 24 * 60 * 60 * 1000) {
      exchangeRates = cachedRate.rates;
    } else {
      exchangeRates = await fetchAndStoreExchangeRates();
    }

    // Function to convert amount to target currency
    const convertToCurrency = (amount, fromCurrency, toCurrency) => {
      const normalizedFrom = fromCurrency === "EURO" ? "EUR" : fromCurrency;
      const normalizedTo = toCurrency === "EURO" ? "EUR" : toCurrency;

      if (normalizedFrom === normalizedTo) return amount;
      if (
        !exchangeRates ||
        !exchangeRates[normalizedFrom] ||
        !exchangeRates[normalizedTo]
      ) {
        console.warn(
          `Exchange rate for ${normalizedFrom} or ${normalizedTo} not found, using 1:1 conversion.`
        );
        return amount; // Fallback: use 1:1 if rate is missing
      }
      const rateFrom = exchangeRates[normalizedFrom] || 1;
      const rateTo = exchangeRates[normalizedTo] || 1;
      return amount * (rateTo / rateFrom);
    };

    // Aggregate expenses, considering user-specific splits and transaction status
    const convertedSummary = targetCurrencies.reduce((acc, currency) => {
      let totalExpenses = 0,
        totalPending = 0,
        totalSettled = 0;

      expenses.forEach((expense) => {
        // Find the user's split in this expense
        const userSplit = expense.splitDetails.find((split) =>
          split.userId.equals(userId)
        );
        if (!userSplit) return; // Skip if user isn’t in this expense split

        const convertedAmount = convertToCurrency(
          userSplit.amountOwed,
          expense.currency,
          currency
        );
        totalExpenses += convertedAmount; // Total amount the user owes for this expense

        // Check if the user's split is settled based on transactionId
        if (userSplit.transactionId) {
          totalSettled += convertedAmount; // Add to settled if transactionId exists
        } else {
          totalPending += convertedAmount; // Add to pending if no transactionId
        }
      });

      acc[currency] = {
        totalExpenses: Math.round(totalExpenses * 100) / 100, // Round to 2 decimal places
        totalPending: Math.round(totalPending * 100) / 100,
        totalSettled: Math.round(totalSettled * 100) / 100,
      };
      return acc;
    }, {});

    res.status(200).json({
      message: "Expense summary fetched successfully",
      summary: convertedSummary,
    });
  } catch (error) {
    console.error(
      "Error creating expense summary:",
      error.message,
      error.stack
    );
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// NEW: Returns the 5 most recent expenses with details, ensuring correct payer
const getRecentExpenses = async (req, res) => {
  try {
    const userId = req.user.id;
    //console.log("Logged-in user ID:", userId); // Log the logged-in user's ID

    // Log raw expenses before population
    const rawExpenses = await Expense.find({ participants: userId })
      .sort({ createdAt: -1 })
      .limit(5);
    // console.log(
    //   "Raw expenses before population:",
    //   JSON.stringify(rawExpenses, null, 2)
    // );

    const expenses = await Expense.find({ participants: userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("payer", "fullName email") // Populate payer details (must be the actual payer)
      .populate("participants", "fullName email") // Populate participant details
      .populate("splitDetails.userId", "fullName email"); // Populate splitDetails userId with fullName and email

    // Log populated expenses
    // console.log(
    //   "Populated expenses after population:",
    //   JSON.stringify(expenses, null, 2)
    // );

    // Transform the expenses to include full names in splitDetails and verify payer
    const transformedExpenses = expenses.map((expense) => {
      const transformedSplitDetails = expense.splitDetails.map((detail) => ({
        ...detail.toObject(),
        user: detail.userId
          ? {
              fullName: detail.userId.fullName || "Unknown",
              // Optionally include email if needed
            }
          : { fullName: "Unknown" },
      }));

      // Log the payer and split details for debugging
      // console.log(
      //   `Transforming expense ${expense._id}: Payer = ${expense.payer?.fullName}, SplitDetails =`,
      //   JSON.stringify(transformedSplitDetails, null, 2)
      // );

      // Ensure payer.fullName is the actual payer, not influenced by req.user
      const payerFullName = expense.payer?.fullName || "Unknown";

      return {
        ...expense.toObject(),
        splitDetails: transformedSplitDetails,
        payer: {
          ...expense.payer?.toObject(),
          fullName: payerFullName,
        },
      };
    });

    // Log transformed expenses before sending
    // console.log(
    //   "Transformed expenses before response:",
    //   JSON.stringify(transformedExpenses, null, 2)
    // );

    res.status(200).json({
      message: "Recent expenses fetched successfully",
      expenses: transformedExpenses,
    });
  } catch (error) {
    console.error(
      "Error fetching recent expenses:",
      error.message,
      error.stack
    );
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// NEW: Returns expense breakdown and monthly trend with currency conversion to INR
const getExpenseBreakdown = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // Find all groups where the user is a member
    const userGroups = await Group.find({ members: userId }).select("_id");
    const groupIds = userGroups.map((group) => group._id);

    // Find all expenses where the user is a participant or the expense belongs to one of the user's groups
    const expenses = await Expense.find({
      $or: [
        { participants: userId }, // User is a participant
        { groupId: { $in: groupIds } }, // Expense belongs to a group the user is in
      ],
    }).populate("participants", "fullName"); // Populate participant names for debugging

    const BASE_CURRENCY = process.env.BASE_CURRENCY || "INR";
    const targetCurrency = req.query.currency
      ? req.query.currency.toString().toUpperCase()
      : "INR"; // Default to INR

    // Fetch or retrieve cached exchange rates
    let exchangeRates;
    const cachedRate = await ExchangeRate.findOne({
      baseCurrency: BASE_CURRENCY,
    });
    if (cachedRate && new Date() - cachedRate.timestamp < 24 * 60 * 60 * 1000) {
      exchangeRates = cachedRate.rates;
    } else {
      exchangeRates = await fetchAndStoreExchangeRates();
    }

    // Function to convert amount to target currency
    const convertToCurrency = (amount, fromCurrency, toCurrency) => {
      const normalizedFrom = fromCurrency === "EURO" ? "EUR" : fromCurrency;
      const normalizedTo = toCurrency === "EURO" ? "EUR" : toCurrency;

      if (normalizedFrom === normalizedTo) return amount;
      if (
        !exchangeRates ||
        !exchangeRates[normalizedFrom] ||
        !exchangeRates[normalizedTo]
      ) {
        console.warn(
          `Exchange rate for ${normalizedFrom} or ${normalizedTo} not found, using 1:1 conversion.`
        );
        return amount; // Fallback: use 1:1 if rate is missing
      }
      const rateFrom = exchangeRates[normalizedFrom] || 1;
      const rateTo = exchangeRates[normalizedTo] || 1;
      return Math.round(amount * (rateTo / rateFrom) * 100) / 100; // Round to 2 decimal places
    };

    // Aggregate breakdown and trend by type and month, considering user-specific splits
    const breakdown = {}; // Total expenses by type (no distinction between pending/settled yet)
    const monthlyTrend = {}; // Total expenses by month (no distinction between pending/settled yet)
    const breakdownPending = {}; // Pending expenses by type
    const breakdownSettled = {}; // Settled expenses by type
    const monthlyTrendPending = {}; // Pending expenses by month
    const monthlyTrendSettled = {}; // Settled expenses by month

    expenses.forEach((expense) => {
      // Find the user's split in this expense
      const userSplit = expense.splitDetails.find((split) =>
        split.userId.equals(userId)
      );
      if (!userSplit) return; // Skip if user isn’t in this expense split

      const convertedAmount = convertToCurrency(
        userSplit.amountOwed,
        expense.currency,
        targetCurrency
      );

      // Aggregate total expenses by type and month (matching Expense Cards totalExpenses)
      breakdown[expense.type] =
        (breakdown[expense.type] || 0) + convertedAmount;
      const month = new Date(expense.createdAt).toLocaleString("default", {
        month: "long",
        year: "numeric",
      });
      monthlyTrend[month] = (monthlyTrend[month] || 0) + convertedAmount;

      // Distinguish between pending and settled based on transactionId
      if (userSplit.transactionId) {
        // Settled
        breakdownSettled[expense.type] =
          (breakdownSettled[expense.type] || 0) + convertedAmount;
        monthlyTrendSettled[month] =
          (monthlyTrendSettled[month] || 0) + convertedAmount;
      } else {
        // Pending
        breakdownPending[expense.type] =
          (breakdownPending[expense.type] || 0) + convertedAmount;
        monthlyTrendPending[month] =
          (monthlyTrendPending[month] || 0) + convertedAmount;
      }
    });

    res.status(200).json({
      message: "Expense breakdown fetched successfully",
      breakdown, // Total expenses by type (matches totalExpenses in Expense Cards)
      monthlyTrend, // Total expenses by month (matches totalExpenses in Expense Cards)
      breakdownPending, // Pending expenses by type (matches totalPending in Expense Cards)
      breakdownSettled, // Settled expenses by type (matches totalSettled in Expense Cards)
      monthlyTrendPending, // Pending expenses by month
      monthlyTrendSettled, // Settled expenses by month
    });
  } catch (error) {
    console.error(
      "Error fetching expense breakdown:",
      error.message,
      error.stack
    );
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const getExchangeRates = async () => {
  try {
    const exchangeRates = await ExchangeRate.findOne()
      .sort({ timestamp: -1 }) // Get the most recent exchange rate
      .exec();
    if (!exchangeRates) {
      throw new Error("No exchange rates found in database");
    }
    return exchangeRates;
  } catch (error) {
    console.error("Error fetching exchange rates:", error);
    throw error;
  }
};

module.exports = {
  createExpense,
  getGroupExpenses,
  getUserExpenses,
  getExpenseById,
  deleteExpense,
  ExchangeRate,
  getExchangeRates,
  getExpenseSummary, // NEW
  updateExchangeRates,
  getRecentExpenses, // NEW
  getExpenseBreakdown, // NEW
};
