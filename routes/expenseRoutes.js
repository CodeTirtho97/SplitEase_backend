const express = require("express");
const {
  createExpense,
  getGroupExpenses,
  getUserExpenses,
  getExpenseById,
  deleteExpense,
  getExpenseSummary, // NEW
  updateExchangeRates,
  getRecentExpenses, // NEW
  getExpenseBreakdown, // NEW
} = require("../services/expenseService");
const protect = require("../middleware/authMiddleware");

const router = express.Router();

// Existing endpoints
router.post("/create", protect, createExpense);
router.get("/group/:groupId", protect, getGroupExpenses);
router.get("/my-expenses", protect, getUserExpenses);
router.get("/expense/:expenseId", protect, getExpenseById);
router.delete("/delete/:expenseId", protect, deleteExpense);

// NEW endpoints for dashboard and charts
router.get("/summary", protect, getExpenseSummary);
router.post("/update-exchange-rates", protect, updateExchangeRates);
router.get("/recent", protect, getRecentExpenses);
router.get("/breakdown", protect, getExpenseBreakdown);

module.exports = router;
