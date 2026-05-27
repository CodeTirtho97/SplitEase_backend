const express = require("express");
const {
  createExpense,
  getGroupExpenses,
  getUserExpenses,
  getExpenseById,
  deleteExpense,
} = require("../controllers/expenseController");
const {
  getExpenseSummary,
  getRecentExpenses,
  getExpenseBreakdown,
} = require("../controllers/analyticsController");
const { updateExchangeRates } = require("../controllers/exchangeRateController");
const protect = require("../middleware/authMiddleware");
const validateObjectId = require("../middleware/validateObjectId");
const { cacheMiddleware, rateLimiter } = require("../config/redis");

const expenseRateLimiter = rateLimiter(30, 60, "Too many expense requests, please slow down");

const router = express.Router();

/**
 * @swagger
 * /api/expenses/create:
 *   post:
 *     summary: Create a new shared expense
 *     description: >
 *       Records a new expense and immediately generates pending transactions
 *       for each participant who owes the payer. Supports three split modes:
 *
 *       - **Equal** — amount divided evenly; no `splitValues` needed.
 *       - **Percentage** — provide `splitValues` with `{ userId, percentage }`;
 *         percentages must sum to exactly 100.
 *       - **Custom** — provide `splitValues` with `{ userId, amount }`;
 *         amounts must sum to `totalAmount`.
 *
 *       Self-transactions (payer owes themselves) are automatically excluded.
 *       Real-time WebSocket notifications are sent to all participants via
 *       Redis Pub/Sub.
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [totalAmount, description, participants, splitMethod, payeeId]
 *             properties:
 *               totalAmount:
 *                 type: number
 *                 minimum: 0.01
 *                 example: 1500
 *               description:
 *                 type: string
 *                 maxLength: 30
 *                 example: Hotel booking
 *               participants:
 *                 type: array
 *                 minItems: 2
 *                 items:
 *                   type: string
 *                 description: Array of user IDs including the payer
 *                 example: ["64b1f2c8e4b0a12345678901", "64b1f2c8e4b0a12345678902", "64b1f2c8e4b0a12345678903"]
 *               splitMethod:
 *                 type: string
 *                 enum: [Equal, Percentage, Custom]
 *                 example: Equal
 *               payeeId:
 *                 type: string
 *                 description: User ID of the person who paid the bill
 *                 example: 64b1f2c8e4b0a12345678901
 *               groupId:
 *                 type: string
 *                 description: Optional — link this expense to a group
 *                 example: 64b1f2c8e4b0a12345678902
 *               currency:
 *                 type: string
 *                 enum: [INR, USD, EUR, GBP, JPY]
 *                 default: INR
 *                 example: INR
 *               type:
 *                 type: string
 *                 enum: [Food, Transportation, Accommodation, Utilities, Entertainment, Miscellaneous]
 *                 default: Miscellaneous
 *                 example: Accommodation
 *               splitValues:
 *                 type: array
 *                 description: Required for Percentage or Custom split modes
 *                 items:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     percentage:
 *                       type: number
 *                       description: Used for Percentage mode
 *                     amount:
 *                       type: number
 *                       description: Used for Custom mode
 *                 example: []
 *     responses:
 *       201:
 *         description: Expense created and transactions generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Expense added successfully with transactions
 *                 expense:
 *                   $ref: '#/components/schemas/Expense'
 *                 transactions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Transaction'
 *       400:
 *         description: Validation error (bad split values, duplicate expense, etc.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 */
router.post("/create", protect, expenseRateLimiter, createExpense);

/**
 * @swagger
 * /api/expenses/summary:
 *   get:
 *     summary: Get the authenticated user's expense summary
 *     description: >
 *       Returns per-currency totals for the user's expenses, pending payments,
 *       and settled payments across all groups. Results are converted to five
 *       currencies (INR, USD, EUR, GBP, JPY) using cached exchange rates.
 *       Response is cached for 5 minutes in Redis.
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Summary fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Expense summary fetched successfully
 *                 summary:
 *                   type: object
 *                   description: Keyed by currency code
 *                   example:
 *                     INR:
 *                       totalExpenses: 5000
 *                       totalPending: 1200
 *                       totalSettled: 3800
 *                     USD:
 *                       totalExpenses: 60.5
 *                       totalPending: 14.5
 *                       totalSettled: 46
 *       401:
 *         description: Unauthorized
 */
router.get("/summary", protect, cacheMiddleware(300), getExpenseSummary);

/**
 * @swagger
 * /api/expenses/recent:
 *   get:
 *     summary: Get the 10 most recent expenses for the authenticated user
 *     description: >
 *       Returns the 10 latest expenses where the user is either the payer
 *       or a participant, sorted by creation date descending. Includes
 *       populated payer, participants, and split details.
 *       Cached for 2 minutes in Redis.
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Recent expenses fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Recent expenses fetched successfully
 *                 expenses:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Expense'
 *       401:
 *         description: Unauthorized
 */
router.get("/recent", protect, cacheMiddleware(120), getRecentExpenses);

/**
 * @swagger
 * /api/expenses/breakdown/{currency}:
 *   get:
 *     summary: Get expense breakdown by category and monthly trend
 *     description: >
 *       Aggregates the user's expenses into category totals (Food,
 *       Transportation, etc.) and monthly trend data. All amounts are
 *       converted to the requested currency using daily-synced exchange rates.
 *       Also separates pending vs settled amounts for charting.
 *       Cached for 5 minutes in Redis.
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: currency
 *         required: true
 *         schema:
 *           type: string
 *           enum: [INR, USD, EUR, GBP, JPY]
 *         example: INR
 *     responses:
 *       200:
 *         description: Breakdown fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 breakdown:
 *                   type: object
 *                   description: Total amount spent per expense category
 *                   example:
 *                     Food: 2000
 *                     Accommodation: 5000
 *                 monthlyTrend:
 *                   type: object
 *                   description: Total amount spent per calendar month
 *                   example:
 *                     "June 2024": 4500
 *                     "July 2024": 2500
 *                 breakdownPending:
 *                   type: object
 *                   description: Pending amounts per category
 *                 breakdownSettled:
 *                   type: object
 *                   description: Settled amounts per category
 *                 monthlyTrendPending:
 *                   type: object
 *                 monthlyTrendSettled:
 *                   type: object
 *       401:
 *         description: Unauthorized
 */
router.get("/breakdown/:currency", protect, cacheMiddleware(300), getExpenseBreakdown);

/**
 * @swagger
 * /api/expenses/my-expenses:
 *   get:
 *     summary: Get all expenses where the user is a participant
 *     description: >
 *       Returns every expense where the authenticated user appears in the
 *       `participants` array, with payer and participant details populated.
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User expenses fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User expenses fetched successfully.
 *                 expenses:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Expense'
 *       401:
 *         description: Unauthorized
 */
router.get("/my-expenses", protect, getUserExpenses);

/**
 * @swagger
 * /api/expenses/group/{groupId}:
 *   get:
 *     summary: Get all expenses for a specific group
 *     description: >
 *       Returns every expense linked to the given group, with payer and
 *       participant details fully populated. Cached for 60 seconds in Redis.
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *         example: 64b1f2c8e4b0a12345678902
 *     responses:
 *       200:
 *         description: Group expenses fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 expenses:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Expense'
 *       404:
 *         description: No expenses found for this group
 *       401:
 *         description: Unauthorized
 */
router.get("/group/:groupId", protect, validateObjectId, getGroupExpenses);

/**
 * @swagger
 * /api/expenses/expense/{expenseId}:
 *   get:
 *     summary: Get a single expense by ID
 *     description: Returns full details for one expense, including split breakdown.
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: expenseId
 *         required: true
 *         schema:
 *           type: string
 *         example: 64b1f2c8e4b0a12345678903
 *     responses:
 *       200:
 *         description: Expense details fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 expense:
 *                   $ref: '#/components/schemas/Expense'
 *       404:
 *         description: Expense not found
 *       401:
 *         description: Unauthorized
 */
router.get("/expense/:expenseId", protect, validateObjectId, getExpenseById);

/**
 * @swagger
 * /api/expenses/delete/{expenseId}:
 *   delete:
 *     summary: Delete an expense and its transactions
 *     description: >
 *       Only the **payer** of the expense can delete it. Deletion cascades to
 *       all transactions linked to the expense. Real-time notifications are
 *       sent to all affected participants via WebSocket.
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: expenseId
 *         required: true
 *         schema:
 *           type: string
 *         example: 64b1f2c8e4b0a12345678903
 *     responses:
 *       200:
 *         description: Expense deleted successfully
 *       403:
 *         description: Only the expense payer can delete this expense
 *       404:
 *         description: Expense not found
 *       401:
 *         description: Unauthorized
 */
router.delete("/delete/:expenseId", protect, validateObjectId, expenseRateLimiter, deleteExpense);

/**
 * @swagger
 * /api/expenses/update-exchange-rates:
 *   post:
 *     summary: Force-refresh exchange rates from external API
 *     description: >
 *       Triggers an immediate re-fetch from the configured ExchangeRates API
 *       and overwrites the cached rates in MongoDB. Normally rates update
 *       automatically at midnight UTC via a cron job. Use this endpoint to
 *       force an update mid-day if rates appear stale.
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Exchange rates updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Exchange rates updated successfully
 *                 rates:
 *                   type: object
 *                   example:
 *                     USD: 0.012
 *                     EUR: 0.011
 *                     GBP: 0.0095
 *                     JPY: 1.8
 *       500:
 *         description: Failed to fetch from external API (fallback rates returned)
 */
router.post("/update-exchange-rates", protect, updateExchangeRates);

module.exports = router;
