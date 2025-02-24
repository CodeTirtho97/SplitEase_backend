// services/dashboardService.js
const mongoose = require("mongoose"); // Add Mongoose for ObjectId
const Expense = require("../models/Expense");
const Transaction = require("../models/Transaction");
const Group = require("../models/Group");
const User = require("../models/User");
const { ExchangeRate } = require("./expenseService"); // Add ExchangeRate model

////console.log("Dashboard Service Loaded"); // Debug log

let getDashboardStats = async (userId) => {
  ////console.log("Received userId in getDashboardStats:", userId, typeof userId); // Debug log
  try {
    // Convert userId to ObjectId using 'new'
    let objectIdUserId;
    try {
      objectIdUserId = new mongoose.Types.ObjectId(userId);
      ////console.log("Converted userId to ObjectId:", objectIdUserId); // Debug log
    } catch (error) {
      console.error("Invalid userId format:", userId, error);
      throw new Error("Invalid user ID format");
    }

    // Fetch latest exchange rates from ExchangeRate schema
    const exchangeRatesData = await ExchangeRate.findOne()
      .sort({ timestamp: -1 }) // Get the most recent exchange rate
      .exec();
    if (!exchangeRatesData) {
      throw new Error("No exchange rates found in database");
    }
    //console.log("Exchange rates fetched:", exchangeRatesData); // Debug log

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
      // //console.log(
      //   `Converting ${amount} ${currency} to INR: ${inrAmount} (rate: ${rate})`
      // ); // Debug log
      return inrAmount;
    };

    // 🔹 Total Expenses: Sum of all expenses where user is the payer (converted to INR)
    //console.log("Querying Expenses for payer:", objectIdUserId); // Debug log
    const expenses = await Expense.find({ payer: objectIdUserId }).select(
      "totalAmount currency"
    );
    //console.log("Expenses fetched:", expenses); // Debug log
    const totalExpenses = Math.floor(
      expenses.reduce((sum, expense) => {
        const inrAmount = convertToINR(
          expense.totalAmount,
          expense.currency || "INR"
        );
        //console.log(
        //   `Total Expense contribution: ${inrAmount} INR for ${
        //     expense.totalAmount
        //   } ${expense.currency || "INR"}`
        // );
        return sum + inrAmount;
      }, 0)
    );

    // 🔹 Pending Payments: Sum of transaction amounts where user is sender and status is "Pending" (converted to INR)
    //console.log("Querying Pending Transactions for sender:", objectIdUserId); // Debug log
    const pendingTransactions = await Transaction.find({
      sender: objectIdUserId,
      status: "Pending",
    }).select("amount currency paymentMode");
    //console.log("Pending Transactions fetched:", pendingTransactions); // Debug log
    const pendingPayments = Math.floor(
      pendingTransactions.reduce((sum, txn) => {
        const inrAmount = convertToINR(txn.amount, txn.currency || "INR");
        //console.log(
        //   `Pending Payment contribution: ${inrAmount} INR for ${txn.amount} ${
        //     txn.currency || "INR"
        //   } (paymentMode: ${txn.paymentMode || "N/A"})`
        // );
        return sum + inrAmount;
      }, 0)
    );

    // 🔹 Settled Payments: Sum of transaction amounts where user is sender and status is "Success" (converted to INR)
    //console.log("Querying Settled Transactions for sender:", objectIdUserId); // Debug log
    const settledTransactions = await Transaction.find({
      sender: objectIdUserId,
      status: "Success",
    }).select("amount currency paymentMode");
    //console.log("Settled Transactions fetched:", settledTransactions); // Debug log
    const settledPayments = Math.floor(
      settledTransactions.reduce((sum, txn) => {
        const inrAmount = convertToINR(txn.amount, txn.currency || "INR");
        //console.log(
        //   `Settled Payment contribution: ${inrAmount} INR for ${txn.amount} ${
        //     txn.currency || "INR"
        //   } (paymentMode: ${txn.paymentMode || "N/A"})`
        // );
        return sum + inrAmount;
      }, 0)
    );

    // 🔹 Total Groups: Count of groups where user is a member
    //console.log("Querying Groups for user as member:", objectIdUserId); // Debug log
    const groups = await Group.find({ members: objectIdUserId }).select(
      "members"
    );
    //console.log("Groups fetched:", groups); // Debug log
    const totalGroups = groups.length;

    // 🔹 Total Members: Count of unique members across all groups the user is part of, excluding the user
    const allMembers = [
      ...new Set(
        groups.reduce(
          (acc, group) => [
            ...acc,
            ...group.members.filter((m) => !m.equals(objectIdUserId)),
          ],
          []
        )
      ),
    ];
    const totalMembers = allMembers.length;

    // 🔹 Group Expenses: Sum of all expenses for all groups the user is part of, irrespective of payer/participant (converted to INR)
    const groupIds = groups.map((group) => group._id);
    //console.log("Querying Group Expenses for groupIds:", groupIds); // Debug log
    const groupExpensesData = await Expense.find({
      groupId: { $in: groupIds },
    }).select("totalAmount currency");
    //console.log("Group Expenses fetched:", groupExpensesData); // Debug log
    const groupExpenses = Math.floor(
      groupExpensesData.reduce((sum, expense) => {
        const inrAmount = convertToINR(
          expense.totalAmount,
          expense.currency || "INR"
        );
        //console.log(
        //   `Group Expense contribution: ${inrAmount} INR for ${
        //     expense.totalAmount
        //   } ${expense.currency || "INR"}`
        // );
        return sum + inrAmount;
      }, 0)
    );

    //console.log("Dashboard Stats Calculated:", {
    //   totalExpenses,
    //   pendingPayments,
    //   settledPayments,
    //   totalGroups,
    //   totalMembers,
    //   groupExpenses,
    // }); // Debug log

    return {
      totalExpenses,
      pendingPayments,
      settledPayments,
      totalGroups,
      totalMembers,
      groupExpenses,
    };
  } catch (error) {
    console.error("Error in getDashboardStats:", error, {
      stack: error.stack,
      message: error.message,
    }); // Detailed error log
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
