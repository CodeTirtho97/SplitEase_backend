const mongoose = require("mongoose");
const logger = require("../utils/logger");
const Expense = require("../models/Expense");
const Transaction = require("../models/Transaction");
const Group = require("../models/Group");
const ExchangeRate = require("../models/ExchangeRate");

const getDashboardStats = async (userId) => {
  try {
    let objectIdUserId;
    try {
      objectIdUserId = new mongoose.Types.ObjectId(userId);
    } catch (error) {
      logger.error(`Invalid userId format: ${userId}`);
      throw new Error("Invalid user ID format");
    }

    // Fetch latest exchange rates
    const exchangeRatesData = await ExchangeRate.findOne()
      .sort({ timestamp: -1 })
      .exec();

    // Convert currency amounts to INR
    const convertToINR = (amount, currency) => {
      if (!currency || currency.toUpperCase() === "INR") return amount;
      if (!exchangeRatesData || !exchangeRatesData.rates) return amount;

      const rate = exchangeRatesData.rates[currency.toUpperCase()];
      if (!rate || rate === 0) {
        logger.warn(`No valid rate found for ${currency}, defaulting to 1:1`);
        return amount;
      }
      return amount * (1 / rate);
    };

    // 1. SETTLED PAYMENTS — transactions where user is sender and status is Success
    const settledTransactionsQuery = await Transaction.find({
      sender: objectIdUserId,
      status: "Success",
    }).select("amount currency _id");

    let settledPayments = 0;
    settledTransactionsQuery.forEach((txn) => {
      settledPayments += convertToINR(txn.amount, txn.currency || "INR");
    });
    settledPayments = Math.floor(settledPayments);

    // 2. PENDING PAYMENTS — transactions where user is sender and status is Pending
    const pendingTransactionsQuery = await Transaction.find({
      sender: objectIdUserId,
      status: "Pending",
    }).select("amount currency _id");

    let pendingPayments = 0;
    pendingTransactionsQuery.forEach((txn) => {
      pendingPayments += convertToINR(txn.amount, txn.currency || "INR");
    });
    pendingPayments = Math.floor(pendingPayments);

    // 3. TOTAL EXPENSES — settled + pending + shares not yet in transactions
    let totalExpenses = settledPayments + pendingPayments;

    // Expenses where user is the payer
    const userExpensesQuery = await Expense.find({ payer: objectIdUserId })
      .populate({ path: "splitDetails", populate: { path: "user" } })
      .select("totalAmount currency splitDetails payer participants");

    for (const expense of userExpensesQuery) {
      const expenseInINR = convertToINR(expense.totalAmount, expense.currency || "INR");
      let userShare = 0;

      if (expense.splitDetails && expense.splitDetails.length > 0) {
        const userSplit = expense.splitDetails.find(
          (split) => split.user && split.user._id && split.user._id.equals(objectIdUserId)
        );

        if (userSplit && typeof userSplit.amountOwed === "number") {
          userShare = convertToINR(userSplit.amountOwed, expense.currency || "INR");
        } else {
          const participantCount = expense.participants
            ? expense.participants.length
            : expense.splitDetails.length || 1;
          userShare = expenseInINR / Math.max(1, participantCount);
        }
      } else {
        userShare = expenseInINR;
      }

      const expenseTransactions = await Transaction.find({
        expenseId: expense._id,
        sender: objectIdUserId,
      });

      if (expenseTransactions.length === 0) {
        totalExpenses += userShare;
      }
    }

    // Expenses where user is participant but not payer
    const participantExpensesQuery = await Expense.find({
      participants: objectIdUserId,
      payer: { $ne: objectIdUserId },
    })
      .populate({ path: "splitDetails", populate: { path: "user" } })
      .select("totalAmount currency splitDetails payer participants");

    for (const expense of participantExpensesQuery) {
      if (expense.splitDetails && expense.splitDetails.length > 0) {
        const userSplit = expense.splitDetails.find(
          (split) => split.user && split.user._id && split.user._id.equals(objectIdUserId)
        );

        if (userSplit && typeof userSplit.amountOwed === "number") {
          const userShare = convertToINR(userSplit.amountOwed, expense.currency || "INR");
          const expenseTransactions = await Transaction.find({
            expenseId: expense._id,
            sender: objectIdUserId,
          });

          if (expenseTransactions.length === 0) {
            totalExpenses += userShare;
          }
        }
      }
    }

    totalExpenses = Math.floor(totalExpenses);
    if (totalExpenses < settledPayments) totalExpenses = settledPayments;

    // 4. GROUPS & MEMBERS
    const userGroups = await Group.find({ members: objectIdUserId }).select("members name _id");
    const totalGroups = userGroups.length;

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

    // 5. GROUP EXPENSES
    const userGroupIds = userGroups.map((g) => g._id);
    const groupExpensesQuery = await Expense.find({
      groupId: { $in: userGroupIds },
    }).select("totalAmount currency");

    let groupExpenses = 0;
    groupExpensesQuery.forEach((expense) => {
      groupExpenses += convertToINR(expense.totalAmount, expense.currency || "INR");
    });
    groupExpenses = Math.floor(groupExpenses);

    return {
      totalExpenses,
      pendingPayments,
      settledPayments,
      totalGroups,
      totalMembers,
      groupExpenses,
    };
  } catch (error) {
    logger.error(`Error calculating dashboard stats: ${error.message}`);
    throw error;
  }
};

const getRecentTransactions = async (userId) => {
  try {
    let objectIdUserId;
    try {
      objectIdUserId = new mongoose.Types.ObjectId(userId);
    } catch (error) {
      console.error("Invalid userId format for transactions:", userId, error);
      throw new Error("Invalid user ID format for transactions");
    }

    const exchangeRatesData = await ExchangeRate.findOne()
      .sort({ timestamp: -1 })
      .exec();

    const convertToINR = (amount, currency) => {
      if (!exchangeRatesData) return amount;
      const rates = exchangeRatesData.rates || {};
      const currencyUpper = currency.toUpperCase();
      if (currencyUpper === "INR") return amount;
      const rate = rates[currencyUpper];
      if (!rate || rate === 0) {
        logger.warn(`No valid rate found for ${currency}, defaulting to 1:1`);
        return amount;
      }
      return amount * (1 / rate);
    };

    const transactions = await Transaction.find({
      $or: [{ sender: objectIdUserId }, { receiver: objectIdUserId }],
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("sender", "fullName")
      .populate("receiver", "fullName");

    return transactions.map((txn) => ({
      ...txn.toJSON(),
      amount: Math.floor(convertToINR(txn.amount, txn.currency || "INR")),
      paymentMode: txn.status === "Success" ? txn.mode || "N/A" : "N/A",
      status: txn.status === "Success" ? "Settled" : txn.status || "N/A",
      currency: txn.currency || "INR",
    }));
  } catch (error) {
    logger.error(`Error in getRecentTransactions: ${error.message}`);
    throw error;
  }
};

module.exports = {
  getDashboardStats,
  getRecentTransactions,
};
