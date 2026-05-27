const mongoose = require("mongoose");
const Expense = require("../models/Expense");
const Group = require("../models/Group");
const User = require("../models/User");
const { calculateSplitDetails } = require("../utils/splitCalculator");
const Transaction = require("../models/Transaction");
const {
  publishExpenseEvent,
  publishNotification,
  createNotification,
} = require("../utils/socketEvents");
const { ValidationError, NotFoundError, ForbiddenError } = require("../utils/AppError");
const logger = require("../utils/logger");

const createExpense = async ({
  totalAmount,
  description,
  participants,
  splitMethod,
  groupId,
  splitValues,
  currency = "INR",
  type = "Miscellaneous",
  paymentMode = "UPI",
  payeeId,
}) => {
  if (!totalAmount || !description || !participants || participants.length < 2 || !payeeId) {
    throw new ValidationError(
      "Total amount, description, payee, and at least two participants are required."
    );
  }
  if (description.length > 30) {
    throw new ValidationError("Description must be 30 characters or less.");
  }
  if (totalAmount <= 0) {
    throw new ValidationError("Expense amount must be greater than zero.");
  }

  if (!mongoose.Types.ObjectId.isValid(payeeId)) {
    throw new ValidationError("Invalid payee ID format");
  }
  const payerId = new mongoose.Types.ObjectId(payeeId);

  const payerUser = await User.findById(payerId);
  if (!payerUser) {
    throw new ValidationError("Payee does not exist.");
  }

  const participantsObjectIds = participants.map((id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError(`Invalid participant ID: ${id}`);
    }
    return new mongoose.Types.ObjectId(id);
  });

  const isPayerInParticipants = participantsObjectIds.some((id) => id.equals(payerId));
  const uniqueParticipants = [
    ...new Map(participantsObjectIds.map((id) => [id.toString(), id])).values(),
  ];

  if (uniqueParticipants.length < 2) {
    throw new ValidationError(
      "At least two unique participants (including or excluding payer) are required."
    );
  }

  const existingUsers = await User.find({ _id: { $in: uniqueParticipants } });
  if (existingUsers.length !== uniqueParticipants.length) {
    throw new ValidationError("One or more participants do not exist.");
  }

  let groupObjectId = null;
  if (groupId) {
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      throw new ValidationError("Invalid group ID format");
    }
    groupObjectId = new mongoose.Types.ObjectId(groupId);
    const existingGroup = await Group.findById(groupObjectId);
    if (!existingGroup) {
      throw new ValidationError("Group not found.");
    }
  }

  const existingExpense = await Expense.findOne({
    payer: payerId,
    totalAmount,
    description,
    splitMethod,
    participants: {
      $all: uniqueParticipants.filter((id) => !id.equals(payerId)),
      $size: uniqueParticipants.length - (isPayerInParticipants ? 1 : 0),
    },
    groupId: groupObjectId || null,
  });
  if (existingExpense) {
    throw new ValidationError("Duplicate expense already exists.");
  }

  let splitDetails = calculateSplitDetails(
    splitMethod,
    totalAmount,
    uniqueParticipants,
    splitValues
  );
  splitDetails = splitDetails.filter((split) => !split.userId.equals(payerId));

  const newExpense = await Expense.create({
    payer: payerId,
    totalAmount,
    description,
    participants: uniqueParticipants.filter((id) => !id.equals(payerId)),
    splitMethod,
    splitDetails,
    groupId: groupObjectId,
    currency,
    type,
  });

  const transactionPromises = splitDetails.map((split) =>
    Transaction.create({
      expenseId: newExpense._id,
      sender: split.userId,
      receiver: payerId,
      amount: split.amountOwed,
      currency,
      mode: paymentMode,
      status: "Pending",
    })
  );
  const transactions = await Promise.all(transactionPromises);

  try {
    const payerDetails = await User.findById(payerId).select("fullName");
    const payerName = payerDetails ? payerDetails.fullName : "Someone";

    await publishExpenseEvent(
      "expense_created",
      {
        _id: newExpense._id,
        description: newExpense.description,
        totalAmount: newExpense.totalAmount,
        currency: newExpense.currency,
        type: newExpense.type,
        payer: { _id: payerId, fullName: payerName },
      },
      groupObjectId ? groupObjectId.toString() : null,
      uniqueParticipants.map((id) => id.toString())
    );

    const participantIds = uniqueParticipants
      .filter((id) => !id.equals(payerId))
      .map((id) => id.toString());

    for (const userId of participantIds) {
      const notification = createNotification(
        "expense",
        "New Expense Added",
        `${payerName} added a new expense: ${description} (${currency} ${totalAmount})`,
        {
          expenseId: newExpense._id.toString(),
          groupId: groupObjectId ? groupObjectId.toString() : null,
        }
      );
      await publishNotification(userId, notification);
    }
  } catch (error) {
    logger.error(`Failed to send real-time notifications: ${error.message}`);
  }

  return { expense: newExpense, transactions };
};

const getGroupExpenses = async (groupId) => {
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    throw new ValidationError("Invalid group ID format");
  }

  const expenses = await Expense.find({ groupId })
    .populate("payer", "fullName email")
    .populate("participants", "fullName email");

  return { expenses };
};

const getUserExpenses = async (userId) => {
  const expenses = await Expense.find({
    $or: [{ participants: userId }, { payer: userId }],
  })
    .populate("payer", "fullName email")
    .populate("participants", "fullName email");

  return { expenses };
};

const getExpenseById = async (expenseId) => {
  if (!mongoose.Types.ObjectId.isValid(expenseId)) {
    throw new ValidationError("Invalid expense ID format");
  }

  const expense = await Expense.findById(expenseId)
    .populate("payer", "fullName email")
    .populate("participants", "fullName email");

  if (!expense) {
    throw new NotFoundError("Expense not found.");
  }

  return { expense };
};

const deleteExpense = async (expenseId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(expenseId)) {
    throw new ValidationError("Invalid expense ID format");
  }

  const expense = await Expense.findById(expenseId);
  if (!expense) {
    throw new NotFoundError("Expense not found");
  }

  if (expense.payer.toString() !== userId) {
    throw new ForbiddenError("You are not authorized to delete this expense.");
  }

  await Transaction.deleteMany({ expenseId });
  await Expense.findByIdAndDelete(expenseId);

  try {
    const affectedUsers = Array.from(
      new Set([
        ...expense.participants.map((p) => p.toString()),
        expense.payer.toString(),
      ])
    );

    await publishExpenseEvent(
      "expense_deleted",
      { _id: expenseId, description: expense.description },
      expense.groupId ? expense.groupId.toString() : null,
      affectedUsers
    );

    const otherUsers = affectedUsers.filter((id) => id !== userId);
    for (const uid of otherUsers) {
      const notification = createNotification(
        "expense_deleted",
        "Expense Deleted",
        `An expense "${expense.description}" has been deleted`,
        { expenseId }
      );
      await publishNotification(uid, notification);
    }
  } catch (error) {
    logger.error(`Failed to send real-time notifications for expense deletion: ${error.message}`);
  }
};

module.exports = {
  createExpense,
  getGroupExpenses,
  getUserExpenses,
  getExpenseById,
  deleteExpense,
};
