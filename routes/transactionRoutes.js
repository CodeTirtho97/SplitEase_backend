const express = require("express");
const {
  getUserTransactions,
  updateTransactionStatus,
  getGroupTransactions,
} = require("../services/transactionService"); // Ensure correct imports

const protect = require("../middleware/authMiddleware");
const validateObjectId = require("../middleware/validateObjectId");

const router = express.Router();

// Fetch user's transaction history
router.get("/my-transactions", protect, getUserTransactions);

// Fetch all transactions for a specific group
router.get("/group/:groupId", protect, validateObjectId, getGroupTransactions);

// Update transaction status (User marks payment as successful or failed)
router.put(
  "/update-status/:transactionId",
  protect,
  validateObjectId,
  updateTransactionStatus
);

module.exports = router;
