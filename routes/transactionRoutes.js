const express = require("express");
const {
  createTransaction,
  getUserTransactions,
} = require("../services/transactionService");
const protect = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/pay", protect, createTransaction);
router.get("/history", protect, getUserTransactions);

module.exports = router;
