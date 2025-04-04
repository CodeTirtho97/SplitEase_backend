const mongoose = require("mongoose");
const Transaction = require("../models/Transaction");
const Expense = require("../models/Expense");
const Group = require("../models/Group");
const User = require("../models/User");
const {
  publishTransactionEvent,
  publishNotification,
  createNotification,
} = require("../utils/socketEvents");

// Get pending transactions for the logged-in user (as sender, status: "Pending")
const getPendingTransactions = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const pendingTransactions = await Transaction.find({
      sender: userId,
      status: "Pending",
    })
      .sort({ createdAt: -1 })
      .populate("sender", "fullName email")
      .populate("receiver", "fullName email")
      .populate("expenseId", "description totalAmount currency groupId");

    const transformedTransactions = await Promise.all(
      pendingTransactions.map(async (transaction) => {
        const expense = transaction.expenseId;
        const group = expense.groupId
          ? await Group.findById(expense.groupId).select("name")
          : null;

        return {
          transactionId: transaction.transactionId, // Use hashed transactionId
          date: transaction.createdAt.toISOString().split("T")[0], // Format as YYYY-MM-DD
          expenseName: expense.description || "Unnamed Expense",
          groupName: group?.name || "No Group",
          owedFrom: transaction.receiver.fullName || "Unknown",
          amount: transaction.amount,
          currency: transaction.currency,
        };
      })
    );

    res.status(200).json({
      message: "Pending transactions fetched successfully",
      transactions: transformedTransactions,
    });
  } catch (error) {
    console.error("Error fetching pending transactions:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Get transaction history for the logged-in user (last 10, status: "Success" or "Failed")
const getTransactionHistory = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const transactions = await Transaction.find({
      $or: [{ sender: userId }, { receiver: userId }],
      status: { $in: ["Success", "Failed"] },
    })
      .sort({ updatedAt: -1 }) // Sort by updatedAt for settled transactions
      .limit(10)
      .populate("sender", "fullName email")
      .populate("receiver", "fullName email")
      .populate("expenseId", "description totalAmount currency");

    const transformedTransactions = transactions.map((transaction) => ({
      transactionId: transaction.transactionId, // Use hashed transactionId
      paymentDate: transaction.updatedAt.toISOString().split("T")[0], // Format as YYYY-MM-DD
      paidTo: transaction.receiver.fullName || "Unknown",
      amount: transaction.amount,
      currency: transaction.currency,
      mode: transaction.mode || "N/A",
      status: transaction.status,
    }));

    res.status(200).json({
      message: "Transaction history fetched successfully",
      transactions: transformedTransactions,
    });
  } catch (error) {
    console.error("Error fetching transaction history:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Settle a transaction (update status and mode after payment)
const settleTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { status, mode } = req.body;

    if (!["Success", "Failed"].includes(status)) {
      return res
        .status(400)
        .json({ message: "Status must be 'Success' or 'Failed'" });
    }

    if (!["UPI", "PayPal", "Stripe"].includes(mode)) {
      return res
        .status(400)
        .json({ message: "Invalid payment mode. Use UPI, PayPal, or Stripe." });
    }

    // Find transaction using the hashed transactionId as a string
    const transaction = await Transaction.findOne({
      transactionId: transactionId,
    });
    if (!transaction) {
      return res
        .status(404)
        .json({ message: `Transaction not found for ID: ${transactionId}` });
    }

    // Check if the logged-in user is authorized to settle (e.g., sender)
    const userId = new mongoose.Types.ObjectId(req.user.id);
    if (!transaction.sender.equals(userId)) {
      return res
        .status(403)
        .json({ message: "Unauthorized to settle this transaction" });
    }

    // Simulate payment gateway success (dummy check)
    const isPaymentSuccessful = Math.random() > 0.1; // 90% chance of success (dummy)
    if (!isPaymentSuccessful) {
      return res
        .status(400)
        .json({ message: "Payment failed via dummy gateway" });
    }

    // Update transaction with mode and status
    transaction.mode = mode;
    transaction.status = status;
    transaction.updatedAt = new Date();
    await transaction.save();

    // Update the related Expense to reflect the settled transaction
    if (status === "Success") {
      const expense = await Expense.findById(transaction.expenseId);
      if (expense) {
        // Update splitDetails to mark the specific transaction as paid
        expense.splitDetails = expense.splitDetails.map((detail) => {
          if (
            detail.userId.equals(transaction.sender) && // Sender (who owes)
            detail.amountOwed === transaction.amount && // Match amount
            !detail.transactionId // Ensure it hasn't been marked already
          ) {
            return {
              ...detail,
              transactionId: transaction._id, // Use MongoDB _id for tracking, not hashed transactionId
              expenseStatus: true, // Mark this split as completed
            };
          }
          return detail;
        });

        // Update expenseStatus if all splitDetails are settled
        const allSettled = expense.splitDetails.every(
          (detail) => detail.transactionId
        );
        if (allSettled) {
          expense.expenseStatus = true; // Mark entire expense as completed
        }

        await expense.save();
      }
    }

    // Send real-time notifications via WebSockets
    try {
      // Populate sender and receiver information for better notifications
      await transaction.populate("sender", "fullName");
      await transaction.populate("receiver", "fullName");
      await transaction.populate("expenseId", "description");

      const senderName = transaction.sender.fullName || "Someone";
      const receiverName = transaction.receiver.fullName || "Someone";
      const expenseName = transaction.expenseId.description || "an expense";

      // Prepare simplified transaction object for WebSocket
      const simplifiedTransaction = {
        _id: transaction._id.toString(),
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        mode: transaction.mode,
        updatedAt: transaction.updatedAt,
      };

      // Publish transaction update event
      await publishTransactionEvent(
        status === "Success" ? "transaction_settled" : "transaction_failed",
        simplifiedTransaction,
        transaction.sender.toString(),
        transaction.receiver.toString()
      );

      // Create and send notification to receiver
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

      await publishNotification(transaction.receiver.toString(), notification);

      // If all expense splits are settled, notify the expense owner
      if (expense && expense.expenseStatus && expense.payer) {
        const completionNotification = createNotification(
          "expense_completed",
          "Expense Fully Settled",
          `All payments for "${expenseName}" have been completed`,
          { expenseId: expense._id.toString() }
        );

        await publishNotification(
          expense.payer.toString(),
          completionNotification
        );
      }
    } catch (error) {
      console.error(
        "Failed to send real-time notifications for transaction:",
        error
      );
      // Don't fail the API response due to notification errors
    }

    res.status(200).json({
      message: `Transaction ${status.toLowerCase()}fully settled`,
      transaction: {
        transactionId: transaction.transactionId, // Return the hashed transactionId
        paymentDate: transaction.updatedAt.toISOString().split("T")[0],
        paidTo: transaction.receiver.fullName || "Unknown",
        amount: transaction.amount,
        currency: transaction.currency,
        mode: transaction.mode,
        status: transaction.status,
      },
    });
  } catch (error) {
    console.error("Error settling transaction:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

module.exports = {
  getPendingTransactions,
  getTransactionHistory,
  settleTransaction,
};
