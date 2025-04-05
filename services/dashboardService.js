// services/dashboardService.js
const mongoose = require("mongoose"); // Add Mongoose for ObjectId
const Expense = require("../models/Expense");
const Transaction = require("../models/Transaction");
const Group = require("../models/Group");
const User = require("../models/User");
const { ExchangeRate } = require("./expenseService"); // Add ExchangeRate model

////console.log("Dashboard Service Loaded"); // Debug log

let getDashboardStats = async (userId) => {
  console.log("Calculating dashboard stats for userId:", userId);
  try {
    // Convert userId to ObjectId
    let objectIdUserId;
    try {
      objectIdUserId = new mongoose.Types.ObjectId(userId);
    } catch (error) {
      console.error("Invalid userId format:", userId, error);
      throw new Error("Invalid user ID format");
    }

    // Fetch latest exchange rates
    const exchangeRatesData = await ExchangeRate.findOne()
      .sort({ timestamp: -1 })
      .exec();

    if (!exchangeRatesData) {
      console.log("No exchange rates found, using default 1:1 conversion");
    }

    // Function to convert currency amounts to INR
    const convertToINR = (amount, currency) => {
      // Default to INR if no currency specified
      if (!currency || currency.toUpperCase() === "INR") {
        return amount;
      }

      // If no exchange rates, use 1:1 conversion
      if (!exchangeRatesData || !exchangeRatesData.rates) {
        console.log(
          `No exchange rates available, using 1:1 conversion for ${amount} ${currency}`
        );
        return amount;
      }

      const rates = exchangeRatesData.rates;
      const currencyUpper = currency.toUpperCase();
      const rate = rates[currencyUpper];

      if (!rate || rate === 0) {
        console.error(
          `No valid rate found for ${currency}, defaulting to 1:1 conversion`
        );
        return amount;
      }

      const inrAmount = amount * (1 / rate);
      console.log(
        `Converted ${amount} ${currency} to ${inrAmount} INR (rate: ${rate})`
      );
      return inrAmount;
    };

    // DIRECT DB QUERIES FOR ACCURATE DATA
    // ===================================

    // 1. SETTLED PAYMENTS - Get all successful transactions where user is sender
    console.log(
      "Querying settled payments where user is sender:",
      objectIdUserId
    );
    const settledTransactionsQuery = await Transaction.find({
      sender: objectIdUserId,
      status: "Success",
    }).select("amount currency _id createdAt updatedAt");

    console.log(
      `Found ${settledTransactionsQuery.length} settled transactions`
    );

    let settledPayments = 0;
    settledTransactionsQuery.forEach((txn) => {
      const inrAmount = convertToINR(txn.amount, txn.currency || "INR");
      settledPayments += inrAmount;
      console.log(`Settled payment: ${inrAmount} INR (${txn._id})`);
    });

    // Round to nearest integer
    settledPayments = Math.floor(settledPayments);
    console.log(`Total settled payments: ${settledPayments} INR`);

    // 2. PENDING PAYMENTS - Get all pending transactions where user is sender
    console.log(
      "Querying pending payments where user is sender:",
      objectIdUserId
    );
    const pendingTransactionsQuery = await Transaction.find({
      sender: objectIdUserId,
      status: "Pending",
    }).select("amount currency _id createdAt");

    console.log(
      `Found ${pendingTransactionsQuery.length} pending transactions`
    );

    let pendingPayments = 0;
    pendingTransactionsQuery.forEach((txn) => {
      const inrAmount = convertToINR(txn.amount, txn.currency || "INR");
      pendingPayments += inrAmount;
      console.log(`Pending payment: ${inrAmount} INR (${txn._id})`);
    });

    // Round to nearest integer
    pendingPayments = Math.floor(pendingPayments);
    console.log(`Total pending payments: ${pendingPayments} INR`);

    // 3. TOTAL EXPENSES - Calculate from both transactions and expenses
    // Since transactions represent the actual money movement, we need to:
    // a) Get all expenses where user is the payer
    // b) Get all expenses where user is a participant
    // c) Calculate user's share based on split rules

    console.log("Calculating total expenses for user:", objectIdUserId);

    // a) Start with sum of all payments (settled + pending)
    let totalExpenses = settledPayments + pendingPayments;
    console.log(`Base total expenses (from payments): ${totalExpenses} INR`);

    // b) Add expenses where user is payer but hasn't created transactions yet
    const userExpensesQuery = await Expense.find({
      payer: objectIdUserId,
    })
      .populate({
        path: "splitDetails",
        populate: { path: "user" },
      })
      .select("totalAmount currency splitDetails payer participants createdAt");

    console.log(
      `Found ${userExpensesQuery.length} expenses where user is payer`
    );

    // Process each expense where user is payer
    for (const expense of userExpensesQuery) {
      const expenseInINR = convertToINR(
        expense.totalAmount,
        expense.currency || "INR"
      );

      // Find user's personal share in this expense
      let userShare = 0;

      if (expense.splitDetails && expense.splitDetails.length > 0) {
        // Find the user's split
        const userSplit = expense.splitDetails.find(
          (split) =>
            split.user &&
            split.user._id &&
            split.user._id.equals(objectIdUserId)
        );

        if (userSplit && typeof userSplit.amountOwed === "number") {
          userShare = convertToINR(
            userSplit.amountOwed,
            expense.currency || "INR"
          );
          console.log(
            `User's share in expense: ${userShare} INR (based on split)`
          );
        } else {
          // If user's split is not found, estimate equal split
          const participantCount = expense.participants
            ? expense.participants.length
            : expense.splitDetails
            ? expense.splitDetails.length
            : 1;

          userShare = expenseInINR / Math.max(1, participantCount);
          console.log(
            `User's share in expense: ${userShare} INR (estimated equal split)`
          );
        }
      } else {
        // No split details, assume user is sole participant
        userShare = expenseInINR;
        console.log(
          `User's share in expense: ${userShare} INR (sole participant)`
        );
      }

      // Add to total expenses if not already counted through transactions
      // We need to check if this expense has generated transactions
      const expenseTransactions = await Transaction.find({
        expenseId: expense._id,
        sender: objectIdUserId,
      });

      if (expenseTransactions.length === 0) {
        // No transactions for this expense yet, add user's share
        totalExpenses += userShare;
        console.log(
          `Adding ${userShare} INR to total expenses (no transactions yet)`
        );
      } else {
        console.log(
          `Expense ${expense._id} already has transactions, not adding to total`
        );
      }
    }

    // c) Add expenses where user is participant but not payer
    const participantExpensesQuery = await Expense.find({
      participants: objectIdUserId,
      payer: { $ne: objectIdUserId },
    })
      .populate({
        path: "splitDetails",
        populate: { path: "user" },
      })
      .select("totalAmount currency splitDetails payer participants createdAt");

    console.log(
      `Found ${participantExpensesQuery.length} expenses where user is participant but not payer`
    );

    // Process each expense where user is participant but not payer
    for (const expense of participantExpensesQuery) {
      // Find user's share in this expense
      if (expense.splitDetails && expense.splitDetails.length > 0) {
        // Find the user's split
        const userSplit = expense.splitDetails.find(
          (split) =>
            split.user &&
            split.user._id &&
            split.user._id.equals(objectIdUserId)
        );

        if (userSplit && typeof userSplit.amountOwed === "number") {
          const userShare = convertToINR(
            userSplit.amountOwed,
            expense.currency || "INR"
          );

          // Check if this is already counted in transactions
          const expenseTransactions = await Transaction.find({
            expenseId: expense._id,
            sender: objectIdUserId,
          });

          if (expenseTransactions.length === 0) {
            // No transactions for this expense yet, add user's share
            totalExpenses += userShare;
            console.log(
              `Adding ${userShare} INR to total expenses (participant expense, no transactions yet)`
            );
          } else {
            console.log(
              `Expense ${expense._id} already has transactions, not adding to total`
            );
          }
        }
      }
    }

    // Round total expenses to nearest integer
    totalExpenses = Math.floor(totalExpenses);
    console.log(`Final total expenses: ${totalExpenses} INR`);

    // Ensure logical consistency: total expenses cannot be less than settled payments
    if (totalExpenses < settledPayments) {
      console.log(
        `Warning: Total expenses (${totalExpenses}) is less than settled payments (${settledPayments}). Adjusting...`
      );
      totalExpenses = settledPayments;
    }

    // 4. GROUPS & MEMBERS
    console.log("Querying groups for user:", objectIdUserId);
    const userGroups = await Group.find({
      members: objectIdUserId,
    }).select("members name _id createdAt");

    const totalGroups = userGroups.length;
    console.log(`Found ${totalGroups} groups for user`);

    // Get unique members across all groups (excluding the user)
    const uniqueMembers = new Set();
    userGroups.forEach((group) => {
      if (group.members && Array.isArray(group.members)) {
        group.members.forEach((memberId) => {
          if (memberId && !memberId.equals(objectIdUserId)) {
            uniqueMembers.add(memberId.toString());
          }
        });
      }
    });

    const totalMembers = uniqueMembers.size;
    console.log(`Found ${totalMembers} unique members across all groups`);

    // 5. GROUP EXPENSES - Sum of all expenses in user's groups
    const userGroupIds = userGroups.map((g) => g._id);

    console.log("Querying group expenses for user's groups:", userGroupIds);
    const groupExpensesQuery = await Expense.find({
      groupId: { $in: userGroupIds },
    }).select("totalAmount currency groupId createdAt");

    console.log(
      `Found ${groupExpensesQuery.length} expenses across all groups`
    );

    let groupExpenses = 0;
    groupExpensesQuery.forEach((expense) => {
      const inrAmount = convertToINR(
        expense.totalAmount,
        expense.currency || "INR"
      );
      groupExpenses += inrAmount;
    });

    // Round to nearest integer
    groupExpenses = Math.floor(groupExpenses);
    console.log(`Total group expenses: ${groupExpenses} INR`);

    // 6. CONSTRUCT AND RETURN FINAL RESULT
    const result = {
      totalExpenses,
      pendingPayments,
      settledPayments,
      totalGroups,
      totalMembers,
      groupExpenses,
    };

    console.log("Final dashboard stats for user:", result);
    return result;
  } catch (error) {
    console.error("Error calculating dashboard stats:", error);
    throw error;
  }
};

let getRecentTransactions = async (userId) => {
  try {
    //console.log(
    //   "Starting getRecentTransactions for userId:",
    //   userId,
    //   typeof userId
    // ); // Debug log
    if (!Transaction || typeof Transaction.find !== "function") {
      console.error(
        "Transaction model is undefined or not a function:",
        Transaction
      );
      throw new Error("Transaction model not loaded or invalid");
    }
    // Convert userId to ObjectId if it's a string
    let objectIdUserId;
    try {
      objectIdUserId = new mongoose.Types.ObjectId(userId);
      //console.log(
      //   "Converted userId to ObjectId for transactions:",
      //   objectIdUserId
      // ); // Debug log
    } catch (error) {
      console.error("Invalid userId format for transactions:", userId, error);
      throw new Error("Invalid user ID format for transactions");
    }
    // Fetch latest exchange rates from ExchangeRate schema
    const exchangeRatesData = await ExchangeRate.findOne()
      .sort({ timestamp: -1 }) // Get the most recent exchange rate
      .exec();
    if (!exchangeRatesData) {
      throw new Error("No exchange rates found in database");
    }
    //console.log("Exchange rates fetched for transactions:", exchangeRatesData); // Debug log

    // Function to convert to INR using fetched rates (INR = 1, invert rates for other currencies)
    const convertToINR = (amount, currency) => {
      const rates = exchangeRatesData.rates || {}; // Fallback if rates is undefined
      const currencyUpper = currency.toUpperCase();
      if (currencyUpper === "INR") {
        //console.log(`Converting ${amount} INR to INR: ${amount}`); // Debug log
        return amount; // No conversion needed for INR
      }
      const rate = rates[currencyUpper];
      if (!rate || rate === 0) {
        console.error(`No valid rate found for ${currency}, defaulting to INR`);
        return amount; // Default to INR if rate is missing or zero
      }
      const inrAmount = amount * (1 / rate); // Invert rate: 1 / (rate relative to INR)
      //console.log(
      //   `Converting ${amount} ${currency} to INR: ${inrAmount} (rate: ${rate})`
      // ); // Debug log
      return inrAmount;
    };

    // 🔹 Fetch last 10 transactions where user is sender or receiver
    //console.log("Querying Recent Transactions for user:", objectIdUserId); // Debug log
    const transactions = await Transaction.find({
      $or: [{ sender: objectIdUserId }, { receiver: objectIdUserId }],
    })
      .sort({ createdAt: -1 }) // Most recent first
      .limit(10) // Last 10 transactions
      .populate("sender", "fullName") // Populate sender's full name
      .populate("receiver", "fullName"); // Populate receiver's full name

    //console.log("Recent Transactions Fetched:", transactions); // Debug log

    // Convert transaction amounts to INR and ensure paymentMode and status are present
    const formattedTransactions = transactions.map((txn) => {
      const inrAmount = Math.floor(
        convertToINR(txn.amount, txn.currency || "INR")
      ); // Round to integer
      //console.log(
      //   `Transaction ${txn._id}: Converting ${txn.amount} ${
      //     txn.currency || "INR"
      //   } to INR: ${inrAmount} (paymentMode: ${txn.mode || "N/A"}, status: ${
      //     txn.status
      //   })`
      // ); // Debug log
      return {
        ...txn.toJSON(),
        amount: inrAmount,
        paymentMode: txn.status === "Success" ? txn.mode || "N/A" : "N/A", // Show mode only for Settled (Success) transactions
        status: txn.status === "Success" ? "Settled" : txn.status || "N/A",
        currency: txn.currency || "INR", // Include currency for debugging
      };
    });

    //console.log("Formatted Transactions:", formattedTransactions); // Debug log

    return formattedTransactions;
  } catch (error) {
    console.error("Error in getRecentTransactions:", error, {
      stack: error.stack,
      message: error.message,
    }); // Detailed error log
    throw error;
  }
};

// Ensure functions are available at runtime
if (!getDashboardStats || !getRecentTransactions) {
  console.error("Dashboard functions are undefined at runtime:", {
    getDashboardStats,
    getRecentTransactions,
  });
  throw new Error("Dashboard service functions not loaded");
}

module.exports = {
  getDashboardStats,
  getRecentTransactions,
};
