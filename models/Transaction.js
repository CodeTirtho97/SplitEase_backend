const mongoose = require("mongoose");
const bcrypt = require("bcryptjs"); // Install with `npm install bcryptjs`

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
    enum: ["INR", "USD", "EUR", "GBP", "JPY"],
    default: "INR",
  },
  mode: {
    type: String,
    enum: ["UPI", "PayPal", "Stripe"],
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Pre-save hook to hash transactionId (generate a unique ID and hash it)
transactionSchema.pre("save", async function (next) {
  if (this.isNew) {
    // Generate a unique transaction ID (e.g., using timestamp + random string)
    const uniqueId = `TXN_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    // Hash the unique ID using bcrypt
    const salt = await bcrypt.genSalt(10);
    this.transactionId = await bcrypt.hash(uniqueId, salt);
  }
  this.updatedAt = new Date();
  next();
});

const Transaction = mongoose.model("Transaction", transactionSchema);

module.exports = Transaction;
