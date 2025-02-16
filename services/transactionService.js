const mongoose = require("mongoose");
const Transaction = require("../models/Transaction");
const Expense = require("../models/Expense");

// Create a Transaction (When a user makes a payment)
const createTransaction = async (req, res) => {
  try {
    const { expenseId, sender, receiver, amount, mode } = req.body;

    // Validate inputs
    if (!expenseId || !sender || !receiver || !amount || !mode) {
      return res.status(400).json({ message: "All fields are required." });
    }

    if (
      !mongoose.Types.ObjectId.isValid(expenseId) ||
      !mongoose.Types.ObjectId.isValid(sender) ||
      !mongoose.Types.ObjectId.isValid(receiver)
    ) {
      return res.status(400).json({ message: "Invalid IDs provided." });
    }

    // Ensure Expense Exists
    const expense = await Expense.findById(expenseId);
    if (!expense) {
      return res.status(404).json({ message: "Expense not found." });
    }

    // Prevent duplicate payments for the same expense
    const existingTransaction = await Transaction.findOne({
      expenseId,
      sender,
      receiver,
      amount,
      status: "Success",
    });

    if (existingTransaction) {
      return res.status(400).json({ message: "Payment already completed." });
    }

    // Create new transaction
    const newTransaction = await Transaction.create({
      expenseId,
      sender,
      receiver,
      amount,
      mode,
      status: "Pending", // Default status is pending
    });

    res.status(201).json({
      message: "Transaction created successfully",
      transaction: newTransaction,
    });
  } catch (error) {
    console.error("Error creating transaction:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Fetch all transactions of a user
const getUserTransactions = async (req, res) => {
  try {
    const userId = req.user.id;

    const transactions = await Transaction.find({
      $or: [{ sender: userId }, { receiver: userId }],
    }).populate("expenseId sender receiver");

    res.status(200).json({ transactions });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

module.exports = { createTransaction, getUserTransactions };
