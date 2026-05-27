const mongoose = require("mongoose");
const crypto = require("crypto");
const { CURRENCIES, PAYMENT_MODES } = require("../utils/constants");

const transactionSchema = new mongoose.Schema({
  expenseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Expense",
    required: true,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true, // The user who owes money (logged-in user as sender)
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true, // The user who is owed (receiver)
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  currency: {
    type: String,
    enum: CURRENCIES,
    default: "INR",
  },
  mode: {
    type: String,
    enum: PAYMENT_MODES,
    required: false, // Optional until payment is settled
  },
  status: {
    type: String,
    enum: ["Pending", "Success", "Failed"],
    default: "Pending",
  },
  transactionId: {
    type: String,
    unique: true,
    index: true,
  }, // Hashed transaction ID
}, { timestamps: true });

// Pre-save hook to generate a URL-safe unique transactionId
transactionSchema.pre("save", function (next) {
  if (this.isNew) {
    this.transactionId = crypto.randomBytes(32).toString("hex");
  }
  next();
});

transactionSchema.index({ sender: 1, status: 1 });
transactionSchema.index({ receiver: 1, status: 1 });
transactionSchema.index({ expenseId: 1 });

const Transaction = mongoose.model("Transaction", transactionSchema);

module.exports = Transaction;
