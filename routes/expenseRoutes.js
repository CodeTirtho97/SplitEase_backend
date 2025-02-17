const express = require("express");
const {
  createExpense,
  getGroupExpenses,
  getUserExpenses,
  getExpenseById,
  deleteExpense,
} = require("../services/expenseService");
const protect = require("../middleware/authMiddleware"); // Middleware to protect routes

const router = express.Router();

// ✅ Create a new expense
router.post("/create", protect, createExpense);

// ✅ Fetch all expenses for a specific group
router.get("/group/:groupId", protect, getGroupExpenses);

// ✅ Fetch all expenses for the logged-in user
router.get("/my-expenses", protect, getUserExpenses);

// ✅ Fetch a specific expense by ID
router.get("/expense/:expenseId", protect, getExpenseById);

// ✅ Route to delete an expense (Only Creator can delete)
router.delete("/delete/:expenseId", protect, deleteExpense);

module.exports = router;
