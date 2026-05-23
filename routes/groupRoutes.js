const express = require("express");
const {
  createGroup,
  getUserGroups,
  deleteGroup,
  editGroup,
  viewGroupDetails,
  getUserFriends,
  getGroupDebtSummary,
} = require("../services/groupService");

const protect = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * @swagger
 * /api/groups/create:
 *   post:
 *     summary: Create a new group
 *     description: >
 *       Creates a shared-expense group. All members (except the creator) must
 *       already be in the creator's friends list. The creator is automatically
 *       added to the group even if not listed in `members`. Group name is
 *       limited to 30 characters; description to 100.
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type, members]
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 30
 *                 example: Goa Trip 2024
 *               description:
 *                 type: string
 *                 maxLength: 100
 *                 example: Beach holiday shared expenses
 *               type:
 *                 type: string
 *                 enum: [Travel, Household, Event, Work, Friends]
 *                 example: Travel
 *               members:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of user IDs who are in the creator's friends list
 *                 example: ["64b1f2c8e4b0a12345678901", "64b1f2c8e4b0a12345678902"]
 *     responses:
 *       201:
 *         description: Group created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Group created successfully
 *                 group:
 *                   $ref: '#/components/schemas/Group'
 *       400:
 *         description: Validation error (member not in friends list, duplicate group, etc.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 */
router.post("/create", protect, createGroup);

/**
 * @swagger
 * /api/groups/friends:
 *   get:
 *     summary: Get the current user's friends list
 *     description: >
 *       Returns all users in the authenticated user's friends array, populated
 *       with name and email. Useful for the group-creation UI to show selectable members.
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Friends list returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 friends:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/UserRef'
 *       401:
 *         description: Unauthorized
 */
router.get("/friends", protect, getUserFriends);

/**
 * @swagger
 * /api/groups/mygroups:
 *   get:
 *     summary: Get all groups the authenticated user belongs to
 *     description: >
 *       Uses a MongoDB aggregation pipeline to join creator details, member
 *       details, expenses, and transactions in a single query. Returns counts
 *       and totals alongside full group objects, split into active and completed.
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Groups fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Groups fetched successfully
 *                 totalGroups:
 *                   type: integer
 *                   example: 4
 *                 activeGroups:
 *                   type: integer
 *                   example: 3
 *                 completedGroups:
 *                   type: integer
 *                   example: 1
 *                 groups:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Group'
 *                       - type: object
 *                         properties:
 *                           expenseCount:
 *                             type: integer
 *                             example: 5
 *                           transactionCount:
 *                             type: integer
 *                             example: 8
 *                           totalSpent:
 *                             type: number
 *                             example: 12500
 *       401:
 *         description: Unauthorized
 */
router.get("/mygroups", protect, getUserGroups);

/**
 * @swagger
 * /api/groups/{groupId}/debt-summary:
 *   get:
 *     summary: Get optimised debt settlement plan for a group
 *     description: >
 *       Implements the **Minimum Cash Flow** algorithm (Splitwise-style) to
 *       compute the fewest transactions needed to settle all pending debts
 *       within the group.
 *
 *       **How it works:**
 *       1. All pending transactions for the group's expenses are loaded.
 *       2. Each member's net balance is computed (total owed − total owing).
 *       3. The algorithm greedily matches the largest debtor with the largest
 *          creditor, settling as much as possible in one transaction.
 *       4. This continues until all balances reach zero.
 *
 *       **Result:** at most N-1 transactions for N participants, versus up to
 *       N*(N-1) in the naive pairwise model — typically a 40%+ reduction.
 *
 *       Only accessible by group members.
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the group
 *         example: 64b1f2c8e4b0a12345678902
 *     responses:
 *       200:
 *         description: Optimised settlement plan computed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DebtSummary'
 *       400:
 *         description: Invalid group ID format
 *       403:
 *         description: Caller is not a member of the group
 *       404:
 *         description: Group not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:groupId/debt-summary", protect, getGroupDebtSummary);

/**
 * @swagger
 * /api/groups/{groupId}:
 *   get:
 *     summary: Get full details of a single group
 *     description: >
 *       Returns group metadata, all linked expenses (with payer and participant
 *       details), the 5 most recent completed transactions, and the 5 largest
 *       pending transactions — everything needed to render the group detail page.
 *     tags: [Groups]
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
 *         description: Group details fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 group:
 *                   $ref: '#/components/schemas/Group'
 *                 expenses:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Expense'
 *                 completedTransactions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Transaction'
 *                 pendingTransactions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Transaction'
 *       404:
 *         description: Group not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:groupId", protect, viewGroupDetails);

/**
 * @swagger
 * /api/groups/edit/{groupId}:
 *   put:
 *     summary: Edit an existing group
 *     description: >
 *       Only the group creator can edit. Updatable fields: `description`,
 *       `completed` status, and `members` list. New members must still be in
 *       the creator's friends list.
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *         example: 64b1f2c8e4b0a12345678902
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *                 maxLength: 100
 *                 example: Updated description
 *               completed:
 *                 type: boolean
 *                 example: true
 *               members:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["64b1f2c8e4b0a12345678901"]
 *     responses:
 *       200:
 *         description: Group updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Group updated successfully
 *                 updatedGroup:
 *                   $ref: '#/components/schemas/Group'
 *       400:
 *         description: Validation error or member not in friends list
 *       403:
 *         description: Only the group creator can edit this group
 *       404:
 *         description: Group not found
 */
router.put("/edit/:groupId", protect, editGroup);

/**
 * @swagger
 * /api/groups/delete/{groupId}:
 *   delete:
 *     summary: Delete a group and all its data
 *     description: >
 *       Only the group creator can delete. This is a **cascading delete**:
 *       all expenses linked to the group and all transactions linked to those
 *       expenses are permanently removed.
 *     tags: [Groups]
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
 *         description: Group deleted successfully
 *       403:
 *         description: Only the group creator can delete this group
 *       404:
 *         description: Group not found
 *       401:
 *         description: Unauthorized
 */
router.delete("/delete/:groupId", protect, deleteGroup);

module.exports = router;
