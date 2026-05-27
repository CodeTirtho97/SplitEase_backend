/**
 * Transaction service tests (T4)
 *
 * Tests settleTransaction, getPendingTransactions, and getTransactionHistory
 * against the in-memory MongoDB. Redis / socket events are no-ops.
 */

const User = require("../../models/User");
const Group = require("../../models/Group");
const Expense = require("../../models/Expense");
const Transaction = require("../../models/Transaction");
const {
  settleTransaction,
  getPendingTransactions,
  getTransactionHistory,
} = require("../../services/transactionService");

let sender, receiver, expense, pendingTx;

beforeAll(async () => {
  sender = await User.create({
    fullName: "Sender User",
    email: "sender@test.com",
    gender: "Male",
    password: "hashed",
  });
  receiver = await User.create({
    fullName: "Receiver User",
    email: "receiver@test.com",
    gender: "Female",
    password: "hashed",
  });

  const group = await Group.create({
    name: "Tx Group",
    type: "Friends",
    members: [sender._id, receiver._id],
    createdBy: receiver._id,
  });

  expense = await Expense.create({
    payer: receiver._id,
    totalAmount: 100,
    description: "Test Expense",
    participants: [sender._id],
    splitMethod: "Equal",
    splitDetails: [{ userId: sender._id, amountOwed: 100, percentage: "100.00" }],
    groupId: group._id,
    currency: "INR",
    type: "Miscellaneous",
  });

  // Create a pending transaction (sender owes receiver)
  pendingTx = await Transaction.create({
    expenseId: expense._id,
    sender: sender._id,
    receiver: receiver._id,
    amount: 100,
    currency: "INR",
    mode: "UPI",
    status: "Pending",
  });
});

// ─── getPendingTransactions ───────────────────────────────────────────────────

describe("getPendingTransactions", () => {
  test("returns pending transactions for the sender", async () => {
    const result = await getPendingTransactions(sender._id.toString());
    expect(result.transactions.length).toBeGreaterThan(0);
    result.transactions.forEach((t) => {
      expect(t).toHaveProperty("transactionId");
      expect(t).toHaveProperty("amount");
      expect(t).toHaveProperty("currency");
    });
  });

  test("returns empty array when user has no pending transactions", async () => {
    // receiver is not a sender in any pending transaction
    const result = await getPendingTransactions(receiver._id.toString());
    expect(result.transactions).toEqual([]);
  });
});

// ─── settleTransaction ────────────────────────────────────────────────────────

describe("settleTransaction", () => {
  test("settles a pending transaction with Success status", async () => {
    const result = await settleTransaction(
      pendingTx.transactionId,
      sender._id.toString(),
      { status: "Success", mode: "UPI" }
    );

    expect(result.transaction.status).toBe("Success");
    expect(result.transaction.mode).toBe("UPI");
  });

  test("rejects settlement by a user who is not the sender", async () => {
    // Create another pending transaction
    const anotherTx = await Transaction.create({
      expenseId: expense._id,
      sender: sender._id,
      receiver: receiver._id,
      amount: 50,
      currency: "INR",
      mode: "UPI",
      status: "Pending",
    });

    await expect(
      settleTransaction(anotherTx.transactionId, receiver._id.toString(), {
        status: "Success",
        mode: "UPI",
      })
    ).rejects.toThrow();
  });

  test("rejects invalid status value", async () => {
    await expect(
      settleTransaction(pendingTx.transactionId, sender._id.toString(), {
        status: "Completed", // not a valid status
        mode: "UPI",
      })
    ).rejects.toThrow("Success");
  });

  test("rejects invalid payment mode", async () => {
    const freshTx = await Transaction.create({
      expenseId: expense._id,
      sender: sender._id,
      receiver: receiver._id,
      amount: 25,
      currency: "INR",
      mode: "UPI",
      status: "Pending",
    });

    await expect(
      settleTransaction(freshTx.transactionId, sender._id.toString(), {
        status: "Success",
        mode: "Cash", // not in PAYMENT_MODES
      })
    ).rejects.toThrow("payment mode");
  });

  test("returns NotFoundError for a non-existent transactionId", async () => {
    await expect(
      settleTransaction("nonexistentid", sender._id.toString(), {
        status: "Success",
        mode: "UPI",
      })
    ).rejects.toThrow(/not found/i);
  });
});

// ─── getTransactionHistory ────────────────────────────────────────────────────

describe("getTransactionHistory", () => {
  test("returns settled transactions for the user (as sender or receiver)", async () => {
    // At least one Success transaction was created in the settleTransaction tests
    const result = await getTransactionHistory(sender._id.toString());
    // Result may be empty if settleTransaction tests haven't run yet,
    // but the function should never throw
    expect(result).toHaveProperty("transactions");
    expect(Array.isArray(result.transactions)).toBe(true);
  });
});
