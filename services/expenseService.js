const mongoose = require("mongoose");
const Expense = require("../models/Expense");
const Group = require("../models/Group");
const User = require("../models/User");
const { calculateSplitDetails } = require("../utils/splitCalculator");
const Transaction = require("../models/Transaction");

// ✅ Create an Expense with Full Validation
const createExpense = async (req, res) => {
  try {
    const {
      totalAmount,
      description,
      participants,
      splitMethod,
      groupId,
      splitValues,
      paymentMode = "UPI", // Default to UPI if not provided
    } = req.body;

    if (
      !totalAmount ||
      !description ||
      !participants ||
      participants.length < 2
    ) {
      return res.status(400).json({
        message:
          "Total amount, description, and at least two participants are required.",
      });
    }

    if (totalAmount <= 0) {
      return res.status(400).json({
        message: "Expense amount must be greater than zero.",
      });
    }

    const payerId = new mongoose.Types.ObjectId(req.user.id);

    // ✅ Convert participants to ObjectId & Validate
    let participantsObjectIds = participants.map((id) => {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error(`Invalid participant ID: ${id}`);
      }
      return new mongoose.Types.ObjectId(id);
    });

    // ✅ Ensure all participants exist
    const existingUsers = await User.find({
      _id: { $in: participantsObjectIds },
    });
    if (existingUsers.length !== participantsObjectIds.length) {
      return res
        .status(400)
        .json({ message: "One or more participants do not exist." });
    }

    // ✅ If groupId is provided, validate group existence
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

    // ✅ Prevent duplicate expenses
    const existingExpense = await Expense.findOne({
      payer: payerId,
      totalAmount,
      description,
      splitMethod,
      participants: {
        $all: participantsObjectIds,
        $size: participantsObjectIds.length,
      },
      groupId: groupObjectId || null,
    });

    if (existingExpense) {
      return res
        .status(400)
        .json({ message: "Duplicate expense already exists." });
    }

    // ✅ Generate split details
    let splitDetails = calculateSplitDetails(
      splitMethod,
      totalAmount,
      participantsObjectIds,
      splitValues
    );

    // ✅ Remove payer from transactions (self-pay issue)
    splitDetails = splitDetails.filter(
      (split) => !split.userId.equals(payerId)
    );

    // ✅ Create expense
    const newExpense = await Expense.create({
      payer: payerId,
      totalAmount,
      description,
      participants: participantsObjectIds,
      splitMethod,
      splitDetails,
      groupId: groupObjectId,
    });

    // ✅ Auto-create transactions for each participant
    const transactionPromises = splitDetails.map(async (split) => {
      return await Transaction.create({
        expenseId: newExpense._id,
        sender: split.userId,
        receiver: payerId,
        amount: split.amountOwed,
        currency: "INR",
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

module.exports = {
  createExpense,
  getGroupExpenses,
  getUserExpenses,
  getExpenseById,
  deleteExpense,
};
