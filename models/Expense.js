const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group",
    required: true,
  },
  payer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  totalAmount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: "INR",
  },
  description: {
    type: String,
    required: true,
    maxlength: 30,
  },
  type: {
    type: String,
    enum: [
      "Food",
      "Transportation",
      "Accommodation",
      "Utilities",
      "Entertainment",
      "Miscellaneous",
    ],
    default: "Miscellaneous",
    required: true,
  },
  expenseStatus: {
    type: Boolean,
    default: false, // false = Not Completed, true = Completed
  },
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  ],
  splitMethod: {
    type: String,
    enum: ["Equal", "Percentage", "Custom"],
    default: "Equal",
  },
  splitValues: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      percentage: Number, // Only used for Percentage method
      amount: Number, // Only used for Custom method
    },
  ],
  splitDetails: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      amountOwed: Number,
      percentage: Number, // Store for Percentage splits
      transactionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Transaction",
      },
    },
  ],
  splitDetails: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      amountOwed: Number,
      transactionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Transaction",
      },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Expense", expenseSchema);
