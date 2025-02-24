const express = require("express");
const {
  getPendingTransactions,
  getTransactionHistory,
  settleTransaction,
} = require("../services/transactionService"); // Use the new service file
const protect = require("../middleware/authMiddleware");

// Custom middleware to validate transactionId (hashed string)
const validateTransactionId = (req, res, next) => {
  const { transactionId } = req.params;
  if (!transactionId || typeof transactionId !== "string") {
    return res.status(400).json({ message: "Invalid transaction ID format" });
  }
  next();
};

const router = express.Router();

// Fetch pending transactions for the logged-in user
router.get("/pending", protect, getPendingTransactions);

// Fetch transaction history for the logged-in user
router.get("/history", protect, getTransactionHistory);

// Settle a transaction (update status and mode)
router.put(
  "/:transactionId/settle",
  protect,
  validateTransactionId,
  settleTransaction
);

module.exports = router;
