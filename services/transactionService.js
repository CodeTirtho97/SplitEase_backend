const mongoose = require("mongoose");
const Transaction = require("../models/Transaction");
const Expense = require("../models/Expense");

// ✅ Fetch all transactions for a user
const getUserTransactions = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid User ID format." });
    }

    const transactions = await Transaction.find({
      $or: [{ sender: userId }, { receiver: userId }],
    }).populate(
      "expenseId sender receiver",
      "description totalAmount fullName email"
    );

    res
      .status(200)
      .json({ message: "Transactions fetched successfully.", transactions });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Fetch all transactions for a specific group
const getGroupTransactions = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group ID format." });
    }

    // ✅ Use `$lookup` for better efficiency
    const transactions = await Transaction.aggregate([
      {
        $lookup: {
          from: "expenses",
          localField: "expenseId",
          foreignField: "_id",
          as: "expense",
        },
      },
      { $match: { "expense.groupId": new mongoose.Types.ObjectId(groupId) } },
      {
        $lookup: {
          from: "users",
          localField: "sender",
          foreignField: "_id",
          as: "sender",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "receiver",
          foreignField: "_id",
          as: "receiver",
        },
      },
      {
        $project: {
          "expense.description": 1,
          "expense.totalAmount": 1,
          sender: { $arrayElemAt: ["$sender", 0] },
          receiver: { $arrayElemAt: ["$receiver", 0] },
          amount: 1,
          mode: 1,
          status: 1,
          createdAt: 1,
        },
      },
    ]);

    if (!transactions.length) {
      return res
        .status(404)
        .json({ message: "No transactions found for this group." });
    }

    res.status(200).json({
      message: "Group transactions fetched successfully.",
      transactions,
    });
  } catch (error) {
    console.error("Error fetching group transactions:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Update transaction status (User attempts payment)
const updateTransactionStatus = async (req, res) => {
  try {
    const { transactionId, status } = req.body;

    if (!transactionId || !status) {
      return res
        .status(400)
        .json({ message: "Transaction ID and status are required." });
    }

    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      return res.status(400).json({ message: "Invalid transaction ID." });
    }

    if (!["Success", "Failed"].includes(status)) {
      return res
        .status(400)
        .json({ message: "Invalid status. Choose 'Success' or 'Failed'." });
    }

    // ✅ Find transaction & validate
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found." });
    }

    // ✅ Ensure only the **sender** (who is paying) can update status
    if (transaction.sender.toString() !== req.user.id) {
      return res.status(403).json({
        message: "Unauthorized: Only the sender can update this transaction.",
      });
    }

    // ✅ Prevent re-updating if already marked as "Success"
    if (transaction.status === "Success") {
      return res
        .status(400)
        .json({ message: "Transaction is already marked as 'Success'." });
    }

    // ✅ Update transaction status
    transaction.status = status;
    await transaction.save();

    res
      .status(200)
      .json({ message: "Transaction updated successfully.", transaction });
  } catch (error) {
    console.error("Error updating transaction:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Ensure all functions are correctly exported
module.exports = {
  getUserTransactions,
  getGroupTransactions,
  updateTransactionStatus,
};
