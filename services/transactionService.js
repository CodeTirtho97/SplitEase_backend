const mongoose = require("mongoose");
const Transaction = require("../models/Transaction");
const Expense = require("../models/Expense");
const Group = require("../models/Group");
const {
  publishTransactionEvent,
  publishNotification,
  createNotification,
} = require("../utils/socketEvents");
const { ValidationError, NotFoundError, ForbiddenError } = require("../utils/AppError");
const logger = require("../utils/logger");

const getPendingTransactions = async (userId) => {
  const objectIdUserId = new mongoose.Types.ObjectId(userId);

  const pendingTransactions = await Transaction.find({
    sender: objectIdUserId,
    status: "Pending",
  })
    .sort({ createdAt: -1 })
    .populate("sender", "fullName email")
    .populate("receiver", "fullName email")
    .populate("expenseId", "description totalAmount currency groupId");

  const transactions = await Promise.all(
    pendingTransactions.map(async (transaction) => {
      const expense = transaction.expenseId;
      const group = expense.groupId
        ? await Group.findById(expense.groupId).select("name")
        : null;

      return {
        transactionId: transaction.transactionId,
        date: transaction.createdAt.toISOString().split("T")[0],
        expenseName: expense.description || "Unnamed Expense",
        groupName: group?.name || "No Group",
        owedFrom: transaction.receiver.fullName || "Unknown",
        amount: transaction.amount,
        currency: transaction.currency,
      };
    })
  );

  return { transactions };
};

const getTransactionHistory = async (userId) => {
  const objectIdUserId = new mongoose.Types.ObjectId(userId);

  const transactions = await Transaction.find({
    $or: [{ sender: objectIdUserId }, { receiver: objectIdUserId }],
    status: { $in: ["Success", "Failed"] },
  })
    .sort({ updatedAt: -1 })
    .limit(10)
    .populate("sender", "fullName email")
    .populate("receiver", "fullName email")
    .populate("expenseId", "description totalAmount currency");

  return {
    transactions: transactions.map((transaction) => ({
      transactionId: transaction.transactionId,
      paymentDate: transaction.updatedAt.toISOString().split("T")[0],
      paidTo: transaction.receiver.fullName || "Unknown",
      amount: transaction.amount,
      currency: transaction.currency,
      mode: transaction.mode || "N/A",
      status: transaction.status,
    })),
  };
};

const settleTransaction = async (transactionId, userId, { status, mode }) => {
  if (!["Success", "Failed"].includes(status)) {
    throw new ValidationError("Status must be 'Success' or 'Failed'");
  }
  if (!["UPI", "PayPal", "Stripe"].includes(mode)) {
    throw new ValidationError("Invalid payment mode. Use UPI, PayPal, or Stripe.");
  }

  const transaction = await Transaction.findOne({ transactionId });
  if (!transaction) {
    throw new NotFoundError(`Transaction not found for ID: ${transactionId}`);
  }

  const objectIdUserId = new mongoose.Types.ObjectId(userId);
  if (!transaction.sender.equals(objectIdUserId)) {
    throw new ForbiddenError("Unauthorized to settle this transaction");
  }

  transaction.mode = mode;
  transaction.status = status;
  transaction.updatedAt = new Date();
  await transaction.save();

  // Hoist expense to outer scope so the notification block can access it
  let expense = null;
  if (status === "Success") {
    expense = await Expense.findById(transaction.expenseId);
    if (expense) {
      expense.splitDetails = expense.splitDetails.map((detail) => {
        if (
          detail.userId.equals(transaction.sender) &&
          detail.amountOwed === transaction.amount &&
          !detail.transactionId
        ) {
          return { ...detail.toObject(), transactionId: transaction._id, expenseStatus: true };
        }
        return detail;
      });

      const allSettled = expense.splitDetails.every((detail) => detail.transactionId);
      if (allSettled) {
        expense.expenseStatus = true;
      }

      await expense.save();
    }
  }

  try {
    await transaction.populate("sender", "fullName");
    await transaction.populate("receiver", "fullName");
    await transaction.populate("expenseId", "description");

    const senderName = transaction.sender.fullName || "Someone";
    const _receiverName = transaction.receiver.fullName || "Someone";
    const expenseName = transaction.expenseId.description || "an expense";

    const simplifiedTransaction = {
      _id: transaction._id.toString(),
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      mode: transaction.mode,
      updatedAt: transaction.updatedAt,
    };

    await publishTransactionEvent(
      status === "Success" ? "transaction_settled" : "transaction_failed",
      simplifiedTransaction,
      transaction.sender._id.toString(),
      transaction.receiver._id.toString()
    );

    const notification = createNotification(
      status === "Success" ? "payment_received" : "payment_failed",
      status === "Success" ? "Payment Received" : "Payment Failed",
      status === "Success"
        ? `${senderName} has paid you ${transaction.currency} ${transaction.amount} for "${expenseName}" via ${mode}`
        : `${senderName}'s payment of ${transaction.currency} ${transaction.amount} for "${expenseName}" has failed`,
      {
        transactionId: transaction._id.toString(),
        expenseId: transaction.expenseId._id.toString(),
      }
    );

    await publishNotification(transaction.receiver._id.toString(), notification);

    if (expense && expense.expenseStatus && expense.payer) {
      const completionNotification = createNotification(
        "expense_completed",
        "Expense Fully Settled",
        `All payments for "${expenseName}" have been completed`,
        { expenseId: expense._id.toString() }
      );
      await publishNotification(expense.payer.toString(), completionNotification);
    }
  } catch (error) {
    logger.error(`Failed to send real-time notifications for transaction: ${error.message}`);
  }

  return {
    transaction: {
      transactionId: transaction.transactionId,
      paymentDate: transaction.updatedAt.toISOString().split("T")[0],
      paidTo: transaction.receiver.fullName || "Unknown",
      amount: transaction.amount,
      currency: transaction.currency,
      mode: transaction.mode,
      status: transaction.status,
    },
  };
};

module.exports = {
  getPendingTransactions,
  getTransactionHistory,
  settleTransaction,
};
