const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const { cacheMiddleware, rateLimiter, clearCache } = require("../config/redis");
const {
  getDashboardStats,
  getRecentTransactions,
} = require("../services/dashboardService");

// Cache dashboard stats for 5 minutes
router.get("/stats", protect, cacheMiddleware(300), async (req, res) => {
  try {
    const stats = await getDashboardStats(req.user._id);
    res.status(200).json(stats);
  } catch (error) {
    console.error("Error in /stats route:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Cache recent transactions for 2 minutes
router.get(
  "/transactions/recent",
  protect,
  cacheMiddleware(120),
  async (req, res) => {
    try {
      const transactions = await getRecentTransactions(req.user._id);
      res.status(200).json({ transactions });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Clear dashboard cache when data is updated
router.post("/clear-cache", protect, async (req, res) => {
  try {
    await clearCache(`*${req.user._id}*`);
    res.status(200).json({ message: "Cache cleared successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error clearing cache", error: error.message });
  }
});

module.exports = router;

// routes/expenseRoutes.js (with Redis caching and rate limiting)
const express = require("express");
const { cacheMiddleware, rateLimiter, clearCache } = require("../config/redis");
const {
  createExpense,
  getGroupExpenses,
  getUserExpenses,
  getExpenseById,
  deleteExpense,
  getExpenseSummary,
  updateExchangeRates,
  getRecentExpenses,
  getExpenseBreakdown,
} = require("../services/expenseService");
const protect = require("../middleware/authMiddleware");

// Rate limit expense creation to 20 requests per minute
router.post("/create", protect, rateLimiter(20, 60), createExpense);

// Cache expensive operations like summary and breakdown
router.get("/summary", protect, cacheMiddleware(300), getExpenseSummary);
router.get("/recent", protect, cacheMiddleware(120), getRecentExpenses);
router.get(
  "/breakdown/:currency",
  protect,
  cacheMiddleware(300),
  getExpenseBreakdown
);

// Add cache clearing after data modifications
router.post(
  "/create",
  protect,
  async (req, res, next) => {
    try {
      // Store the original send function
      const originalSend = res.send;

      // Override the send function
      res.send = function (body) {
        // If expense creation was successful, clear related caches
        if (res.statusCode === 201) {
          clearCache(`*${req.user._id}*`).catch((err) =>
            console.error("Cache clearing error:", err)
          );
        }

        // Call the original send function
        originalSend.call(this, body);
      };

      next();
    } catch (error) {
      next(error);
    }
  },
  createExpense
);

// Other routes
router.get("/group/:groupId", protect, cacheMiddleware(60), getGroupExpenses);
router.get("/my-expenses", protect, cacheMiddleware(60), getUserExpenses);
router.get("/expense/:expenseId", protect, cacheMiddleware(60), getExpenseById);

// Clear cache after deleting expense
router.delete("/delete/:expenseId", protect, async (req, res) => {
  try {
    const expenseId = req.params.expenseId;
    const userId = req.user.id;

    // Validate Expense ID and ownership (from your original code)

    // Delete expense and transactions

    // Clear caches related to this user and expense
    await clearCache(`*${userId}*`);
    await clearCache(`*${expenseId}*`);

    res.status(200).json({ message: "Expense deleted successfully" });
  } catch (error) {
    console.error("Error deleting expense:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

module.exports = router;
