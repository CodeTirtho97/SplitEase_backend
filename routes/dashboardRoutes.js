const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const { cacheMiddleware, rateLimiter, clearCache } = require("../config/redis");
const {
  getDashboardStats,
  getRecentTransactions,
} = require("../services/dashboardService");

/**
 * @swagger
 * /api/stats:
 *   get:
 *     summary: Get aggregated dashboard statistics
 *     description: >
 *       Returns a single summary object with all the numbers needed to render
 *       the main dashboard: payment totals, group counts, and per-group
 *       spending. All monetary values are normalised to INR using the latest
 *       cached exchange rates. **Cached for 5 minutes** in Redis — call
 *       `POST /api/clear-cache` to invalidate immediately after data changes.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard stats returned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DashboardStats'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/stats", protect, cacheMiddleware(300), async (req, res) => {
  try {
    const stats = await getDashboardStats(req.user._id);
    res.status(200).json(stats);
  } catch (error) {
    console.error("Error in /stats route:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * @swagger
 * /api/transactions/recent:
 *   get:
 *     summary: Get the 10 most recent transactions (all statuses)
 *     description: >
 *       Returns the last 10 transactions involving the authenticated user
 *       regardless of status, with amounts converted to INR. Payment mode is
 *       included only for settled transactions. **Cached for 2 minutes** in
 *       Redis.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Recent transactions returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transactions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       transactionId:
 *                         type: string
 *                       paymentDate:
 *                         type: string
 *                         format: date
 *                       paidTo:
 *                         type: string
 *                       amount:
 *                         type: number
 *                         description: Amount converted to INR
 *                       currency:
 *                         type: string
 *                         example: INR
 *                       mode:
 *                         type: string
 *                         description: Only present for Success transactions
 *                       status:
 *                         type: string
 *                         enum: [Pending, Success, Failed]
 *       401:
 *         description: Unauthorized
 */
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

/**
 * @swagger
 * /api/clear-cache:
 *   post:
 *     summary: Clear Redis cache for the authenticated user
 *     description: >
 *       Invalidates all Redis cache entries that contain the user's ID in their
 *       key. Call this after making data changes that should be immediately
 *       reflected on the dashboard without waiting for the TTL to expire.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache cleared successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Cache cleared successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Error clearing cache
 */
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
