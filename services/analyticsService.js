const Expense = require("../models/Expense");
const Transaction = require("../models/Transaction");
const Group = require("../models/Group");
const ExchangeRate = require("../models/ExchangeRate");
const { fetchAndStoreExchangeRates } = require("./exchangeRateService");
const { CURRENCIES } = require("../utils/constants");
const logger = require("../utils/logger");

const convertToCurrency = (amount, fromCurrency, toCurrency, exchangeRates) => {
  if (fromCurrency === toCurrency) return amount;
  if (!exchangeRates || !exchangeRates[fromCurrency] || !exchangeRates[toCurrency]) {
    logger.warn(`Exchange rate for ${fromCurrency} or ${toCurrency} not found, using 1:1`);
    return amount;
  }
  const rateFrom = exchangeRates[fromCurrency] || 1;
  const rateTo = exchangeRates[toCurrency] || 1;
  return amount * (rateTo / rateFrom);
};

const getOrFetchRates = async () => {
  const BASE_CURRENCY = process.env.BASE_CURRENCY || "INR";
  const cachedRate = await ExchangeRate.findOne({ baseCurrency: BASE_CURRENCY });
  if (cachedRate && new Date() - cachedRate.timestamp < 24 * 60 * 60 * 1000) {
    return cachedRate.rates;
  }
  return fetchAndStoreExchangeRates();
};

const getExpenseSummary = async (userId) => {
  const userGroups = await Group.find({ members: userId }).select("_id");
  const groupIds = userGroups.map((group) => group._id);

  const expenses = await Expense.find({
    $or: [
      { participants: userId },
      { payer: userId },
      { groupId: { $in: groupIds } },
    ],
  })
    .populate("participants", "fullName")
    .populate("payer", "fullName")
    .populate("splitDetails.userId", "fullName");

  const pendingTransactions = await Transaction.find({
    $or: [{ sender: userId }, { receiver: userId }],
    status: "Pending",
  })
    .populate("sender", "fullName")
    .populate("receiver", "fullName");

  const settledTransactions = await Transaction.find({
    $or: [{ sender: userId }, { receiver: userId }],
    status: "Success",
  })
    .populate("sender", "fullName")
    .populate("receiver", "fullName");

  if (!expenses || expenses.length === 0) {
    return CURRENCIES.reduce((acc, currency) => {
      acc[currency] = { totalExpenses: 0, totalPending: 0, totalSettled: 0 };
      return acc;
    }, {});
  }

  const exchangeRates = await getOrFetchRates();

  const convertedSummary = CURRENCIES.reduce((acc, currency) => {
    let totalExpenses = 0;

    expenses.forEach((expense) => {
      if (expense.payer._id.toString() === userId.toString()) {
        const totalExpenseAmount = expense.totalAmount || 0;
        const amountOwedToPayer = expense.splitDetails.reduce(
          (sum, split) => sum + (split.amountOwed || 0),
          0
        );
        const payerContribution = totalExpenseAmount - amountOwedToPayer;
        totalExpenses += convertToCurrency(payerContribution, expense.currency, currency, exchangeRates);
      } else {
        const userSplit = expense.splitDetails.find(
          (split) => split.userId && split.userId._id.toString() === userId.toString()
        );
        if (userSplit) {
          totalExpenses += convertToCurrency(
            userSplit.amountOwed || 0,
            expense.currency,
            currency,
            exchangeRates
          );
        }
      }
    });

    let totalPending = 0;
    pendingTransactions.forEach((txn) => {
      if (txn.sender._id.toString() === userId.toString()) {
        totalPending += convertToCurrency(txn.amount || 0, txn.currency || "INR", currency, exchangeRates);
      }
    });

    let totalSettled = 0;
    settledTransactions.forEach((txn) => {
      if (txn.sender._id.toString() === userId.toString()) {
        totalSettled += convertToCurrency(txn.amount || 0, txn.currency || "INR", currency, exchangeRates);
      }
    });

    acc[currency] = {
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      totalPending: Math.round(totalPending * 100) / 100,
      totalSettled: Math.round(totalSettled * 100) / 100,
    };

    return acc;
  }, {});

  return convertedSummary;
};

const getRecentExpenses = async (userId) => {
  const expenses = await Expense.find({
    $or: [{ participants: userId }, { payer: userId }],
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate("payer", "fullName email")
    .populate("participants", "fullName email")
    .populate("splitDetails.userId", "fullName email");

  return expenses.map((expense) => {
    const transformedSplitDetails = expense.splitDetails.map((detail) => ({
      ...detail.toObject(),
      user: detail.userId
        ? {
            _id: detail.userId._id,
            fullName: detail.userId.fullName || "Unknown",
            email: detail.userId.email || "",
          }
        : { fullName: "Unknown" },
    }));

    const payerFullName = expense.payer?.fullName || "Unknown";
    const payerId = expense.payer?._id || "";

    return {
      ...expense.toObject(),
      splitDetails: transformedSplitDetails,
      payer: {
        ...expense.payer?.toObject(),
        fullName: payerFullName,
        _id: payerId,
      },
    };
  });
};

const getExpenseBreakdown = async (userId, currency = "INR") => {
  const targetCurrency = currency.toUpperCase();

  const userGroups = await Group.find({ members: userId }).select("_id");
  const groupIds = userGroups.map((group) => group._id);

  const expenses = await Expense.find({
    $or: [{ participants: userId }, { groupId: { $in: groupIds } }],
  }).populate("participants", "fullName");

  const exchangeRates = await getOrFetchRates();

  const convert = (amount, from) =>
    Math.round(convertToCurrency(amount, from, targetCurrency, exchangeRates) * 100) / 100;

  const breakdown = {};
  const monthlyTrend = {};
  const breakdownPending = {};
  const breakdownSettled = {};
  const monthlyTrendPending = {};
  const monthlyTrendSettled = {};

  expenses.forEach((expense) => {
    const userSplit = expense.splitDetails.find((split) => split.userId.equals(userId));
    if (!userSplit) return;

    const convertedAmount = convert(userSplit.amountOwed, expense.currency);
    const month = new Date(expense.createdAt).toLocaleString("default", {
      month: "long",
      year: "numeric",
    });

    breakdown[expense.type] = (breakdown[expense.type] || 0) + convertedAmount;
    monthlyTrend[month] = (monthlyTrend[month] || 0) + convertedAmount;

    if (userSplit.transactionId) {
      breakdownSettled[expense.type] = (breakdownSettled[expense.type] || 0) + convertedAmount;
      monthlyTrendSettled[month] = (monthlyTrendSettled[month] || 0) + convertedAmount;
    } else {
      breakdownPending[expense.type] = (breakdownPending[expense.type] || 0) + convertedAmount;
      monthlyTrendPending[month] = (monthlyTrendPending[month] || 0) + convertedAmount;
    }
  });

  return { breakdown, monthlyTrend, breakdownPending, breakdownSettled, monthlyTrendPending, monthlyTrendSettled };
};

module.exports = { getExpenseSummary, getRecentExpenses, getExpenseBreakdown };
