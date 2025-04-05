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
      throw new Error("No exchange rates found in database");
    }

    // Function to convert currency amounts to INR
    const convertToINR = (amount, currency) => {
      const rates = exchangeRatesData.rates || {};
      const currencyUpper = (currency || "INR").toUpperCase();
      if (currencyUpper === "INR") {
        return amount;
      }
      const rate = rates[currencyUpper];
      if (!rate || rate === 0) {
        console.error(`No valid rate found for ${currency}, defaulting to INR`);
        return amount;
      }
      const inrAmount = amount * (1 / rate);
      return inrAmount;
    };

    // ===== Correct calculation of totalExpenses =====
    // Get all expenses where user participated (either as payer or participant)
    const allUserExpenses = await Expense.find({
      $or: [
        { payer: objectIdUserId }, // User paid
        { participants: objectIdUserId }, // User is a participant
      ],
    })
      .populate("splitDetails")
      .select("totalAmount currency splitDetails payer");

    console.log(
      `Found ${allUserExpenses.length} expenses involving user ${userId}`
    );

    // Calculate total expenses (user's personal spending, not the whole expense amount)
    let totalExpenses = 0;
    allUserExpenses.forEach((expense) => {
      const inrAmount = convertToINR(
        expense.totalAmount,
        expense.currency || "INR"
      );

      if (expense.payer && expense.payer.toString() === userId.toString()) {
        // User is the payer - only count their personal share
        if (expense.splitDetails && expense.splitDetails.length > 0) {
          // Find user's share in the split
          const userSplit = expense.splitDetails.find(
            (split) => split.user && split.user.toString() === userId.toString()
          );

          if (userSplit && typeof userSplit.amountOwed === "number") {
            // Add user's personal share
            const personalShare = convertToINR(
              userSplit.amountOwed,
              expense.currency || "INR"
            );
            totalExpenses += personalShare;
            console.log(`User expense share: ${personalShare} INR (as payer)`);
          } else {
            // If no split found for user, assume equal split
            const equalShare = inrAmount / expense.splitDetails.length;
            totalExpenses += equalShare;
            console.log(
              `User expense share: ${equalShare} INR (as payer with equal split)`
            );
          }
        } else {
          // If no split details, count the full amount (possible solo expense)
          totalExpenses += inrAmount;
          console.log(`User expense: ${inrAmount} INR (as sole payer)`);
        }
      } else {
        // User is a participant but not the payer
        if (expense.splitDetails && expense.splitDetails.length > 0) {
          // Find user's share in the split
          const userSplit = expense.splitDetails.find(
            (split) => split.user && split.user.toString() === userId.toString()
          );

          if (userSplit && typeof userSplit.amountOwed === "number") {
            // Add user's personal share
            const personalShare = convertToINR(
              userSplit.amountOwed,
              expense.currency || "INR"
            );
            totalExpenses += personalShare;
            console.log(
              `User expense share: ${personalShare} INR (as participant)`
            );
          }
        }
      }
    });

    // Round to nearest integer
    totalExpenses = Math.round(totalExpenses);
    console.log(
      `Total personal expenses for user ${userId}: ${totalExpenses} INR`
    );

    // ===== Pending Payments =====
    // Get transactions where user is sender and status is "Pending"
    const pendingTransactions = await Transaction.find({
      sender: objectIdUserId,
      status: "Pending",
    }).select("amount currency");

    const pendingPayments = Math.floor(
      pendingTransactions.reduce((sum, txn) => {
        const inrAmount = convertToINR(txn.amount, txn.currency || "INR");
        return sum + inrAmount;
      }, 0)
    );
    console.log(`Pending payments for user ${userId}: ${pendingPayments} INR`);

    // ===== Settled Payments =====
    // Get transactions where user is sender and status is "Success"
    const settledTransactions = await Transaction.find({
      sender: objectIdUserId,
      status: "Success",
    }).select("amount currency");

    const settledPayments = Math.floor(
      settledTransactions.reduce((sum, txn) => {
        const inrAmount = convertToINR(txn.amount, txn.currency || "INR");
        return sum + inrAmount;
      }, 0)
    );
    console.log(`Settled payments for user ${userId}: ${settledPayments} INR`);

    // ===== Total Groups =====
    const groups = await Group.find({ members: objectIdUserId });
    const totalGroups = groups.length;
    console.log(`Total groups for user ${userId}: ${totalGroups}`);

    // ===== Total Members =====
    // Get unique members across all groups
    const allMembers = new Set();
    groups.forEach((group) => {
      group.members.forEach((member) => {
        if (!member.equals(objectIdUserId)) {
          allMembers.add(member.toString());
        }
      });
    });
    const totalMembers = allMembers.size;
    console.log(`Total unique members for user ${userId}: ${totalMembers}`);

    // ===== Group Expenses =====
    // Total of all expenses in groups user is a member of
    const groupIds = groups.map((group) => group._id);
    const groupExpensesData = await Expense.find({
      groupId: { $in: groupIds },
    }).select("totalAmount currency");

    const groupExpenses = Math.floor(
      groupExpensesData.reduce((sum, expense) => {
        const inrAmount = convertToINR(
          expense.totalAmount,
          expense.currency || "INR"
        );
        return sum + inrAmount;
      }, 0)
    );
    console.log(
      `Total group expenses for user ${userId}: ${groupExpenses} INR`
    );

    // Ensure all values make logical sense
    // Total expenses should always be at least as much as settled payments
    const correctedTotalExpenses = Math.max(totalExpenses, settledPayments);

    // Return all stats
    return {
      totalExpenses: correctedTotalExpenses,
      pendingPayments,
      settledPayments,
      totalGroups,
      totalMembers,
      groupExpenses,
    };
  } catch (error) {
    console.error("Error in getDashboardStats:", error);
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
