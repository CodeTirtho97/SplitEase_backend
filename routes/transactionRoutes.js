const express = require("express");
const {
  getPendingTransactions,
  getTransactionHistory,
  settleTransaction,
} = require("../controllers/transactionController");
const protect = require("../middleware/authMiddleware");

const validateTransactionId = (req, res, next) => {
  const { transactionId } = req.params;
  if (!transactionId || typeof transactionId !== "string") {
    return res.status(400).json({ message: "Invalid transaction ID format" });
  }
  next();
};

const router = express.Router();

/**
 * @swagger
 * /api/transactions/pending:
 *   get:
 *     summary: Get all pending transactions where the user owes money
 *     description: >
 *       Returns every transaction where the authenticated user is the **sender**
 *       (i.e., they owe money) and the status is still `Pending`. Each record
 *       includes the expense name, group name, and the name of the person owed.
 *
 *       Use this to build the "You owe" section of the dashboard.
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending transactions fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Pending transactions fetched successfully
 *                 transactions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       transactionId:
 *                         type: string
 *                         description: bcrypt-hashed opaque identifier used for settlement
 *                         example: "$2a$10$xyz..."
 *                       date:
 *                         type: string
 *                         format: date
 *                         example: "2024-06-15"
 *                       expenseName:
 *                         type: string
 *                         example: Hotel booking
 *                       groupName:
 *                         type: string
 *                         example: Goa Trip 2024
 *                       owedFrom:
 *                         type: string
 *                         description: Full name of the person you owe
 *                         example: Tirthoraj Bhattacharya
 *                       amount:
 *                         type: number
 *                         example: 500
 *                       currency:
 *                         type: string
 *                         example: INR
 *       401:
 *         description: Unauthorized
 */
router.get("/pending", protect, getPendingTransactions);

/**
 * @swagger
 * /api/transactions/history:
 *   get:
 *     summary: Get the last 10 settled or failed transactions
 *     description: >
 *       Returns the 10 most recently updated transactions where the
 *       authenticated user was either sender or receiver and the status is
 *       `Success` or `Failed`. Sorted by `updatedAt` descending.
 *
 *       Includes the payment mode (UPI / PayPal / Stripe) only for settled
 *       transactions.
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Transaction history fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Transaction history fetched successfully
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
 *                         example: "2024-06-20"
 *                       paidTo:
 *                         type: string
 *                         example: Tirthoraj Bhattacharya
 *                       amount:
 *                         type: number
 *                         example: 500
 *                       currency:
 *                         type: string
 *                         example: INR
 *                       mode:
 *                         type: string
 *                         enum: [UPI, PayPal, Stripe, N/A]
 *                         example: UPI
 *                       status:
 *                         type: string
 *                         enum: [Success, Failed]
 *                         example: Success
 *       401:
 *         description: Unauthorized
 */
router.get("/history", protect, getTransactionHistory);

/**
 * @swagger
 * /api/transactions/{transactionId}/settle:
 *   put:
 *     summary: Settle a pending transaction
 *     description: >
 *       Marks a pending transaction as `Success` or `Failed` and records
 *       the payment mode. Only the **sender** (the person who owes) can
 *       settle a transaction.
 *
 *       On `Success`:
 *       - The related expense's `splitDetails` is updated to mark the split
 *         as paid.
 *       - If all splits are paid, the expense is marked fully settled
 *         (`expenseStatus: true`).
 *       - Real-time notification is sent to the receiver via WebSocket.
 *
 *       The `transactionId` parameter is the **bcrypt-hashed** opaque string
 *       returned by the pending transactions endpoint — not a MongoDB ObjectId.
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The bcrypt-hashed transaction identifier (from /pending response)
 *         example: "$2a$10$abc123..."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status, mode]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [Success, Failed]
 *                 example: Success
 *               mode:
 *                 type: string
 *                 enum: [UPI, PayPal, Stripe]
 *                 example: UPI
 *     responses:
 *       200:
 *         description: Transaction settled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Transaction successfully settled
 *                 transaction:
 *                   type: object
 *                   properties:
 *                     transactionId:
 *                       type: string
 *                     paymentDate:
 *                       type: string
 *                       format: date
 *                     paidTo:
 *                       type: string
 *                     amount:
 *                       type: number
 *                     currency:
 *                       type: string
 *                     mode:
 *                       type: string
 *                     status:
 *                       type: string
 *       400:
 *         description: Invalid status/mode, or payment simulation failed
 *       403:
 *         description: Only the sender can settle this transaction
 *       404:
 *         description: Transaction not found
 *       401:
 *         description: Unauthorized
 */
router.put(
  "/:transactionId/settle",
  protect,
  validateTransactionId,
  settleTransaction
);

module.exports = router;
