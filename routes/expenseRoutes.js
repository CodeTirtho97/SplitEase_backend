const express = require("express");
const {
  createExpense,
  getGroupExpenses,
} = require("../services/expenseService");
const protect = require("../middleware/authMiddleware"); // Middleware to protect routes

const router = express.Router();

// Route to create an expense
router.post("/create", protect, createExpense);

// Route to fetch all expenses for a specific group
router.get("/group/:groupId", protect, getGroupExpenses);

module.exports = router;
