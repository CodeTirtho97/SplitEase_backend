const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  expenseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Expense",
    required: true,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: "INR",
  },
  mode: {
    type: String,
    enum: ["UPI", "Stripe", "PayPal"],
    required: true,
  },
  status: {
    type: String,
    enum: ["Success", "Pending", "Failed"],
    default: "Pending",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Transaction", transactionSchema);
