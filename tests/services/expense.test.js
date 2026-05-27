/**
 * Expense service tests (T3)
 *
 * Tests createExpense and getGroupExpenses against the in-memory MongoDB.
 * Redis / socket events are no-ops via moduleNameMapper.
 */

const User = require("../../models/User");
const Group = require("../../models/Group");
const {
  createExpense,
  getGroupExpenses,
  getUserExpenses,
} = require("../../services/expenseService");

let payer, participant1, participant2, group;

beforeAll(async () => {
  payer = await User.create({
    fullName: "Expense Payer",
    email: "expayer@test.com",
    gender: "Male",
    password: "hashed",
  });
  participant1 = await User.create({
    fullName: "Participant One",
    email: "participant1@test.com",
    gender: "Female",
    password: "hashed",
  });
  participant2 = await User.create({
    fullName: "Participant Two",
    email: "participant2@test.com",
    gender: "Other",
    password: "hashed",
  });

  group = await Group.create({
    name: "Expense Group",
    type: "Travel",
    members: [payer._id, participant1._id, participant2._id],
    createdBy: payer._id,
  });
});

// ─── createExpense ────────────────────────────────────────────────────────────

describe("createExpense", () => {
  test("creates expense and generates transactions for non-payer participants", async () => {
    const result = await createExpense({
      totalAmount: 300,
      description: "Hotel stay",
      participants: [payer._id.toString(), participant1._id.toString(), participant2._id.toString()],
      splitMethod: "Equal",
      groupId: group._id.toString(),
      splitValues: [],
      currency: "INR",
      type: "Accommodation",
      paymentMode: "UPI",
      payeeId: payer._id.toString(),
    });

    expect(result.expense).toBeDefined();
    expect(result.expense.totalAmount).toBe(300);
    expect(result.expense.description).toBe("Hotel stay");

    // Transactions created for participant1 and participant2 only (payer excluded)
    expect(result.transactions).toHaveLength(2);
    result.transactions.forEach((t) => {
      expect(t.amount).toBeCloseTo(100, 5);
      expect(t.status).toBe("Pending");
    });
  });

  test("creates expense with percentage split", async () => {
    const result = await createExpense({
      totalAmount: 200,
      description: "Dinner",
      participants: [participant1._id.toString(), participant2._id.toString()],
      splitMethod: "Percentage",
      groupId: group._id.toString(),
      splitValues: [
        { userId: participant1._id.toString(), percentage: 60 },
        { userId: participant2._id.toString(), percentage: 40 },
      ],
      currency: "INR",
      type: "Food",
      paymentMode: "UPI",
      payeeId: payer._id.toString(),
    });

    expect(result.transactions[0].amount).toBeCloseTo(120, 5);
    expect(result.transactions[1].amount).toBeCloseTo(80, 5);
  });

  test("rejects when description exceeds 30 characters", async () => {
    await expect(
      createExpense({
        totalAmount: 100,
        description: "A".repeat(31),
        participants: [participant1._id.toString(), participant2._id.toString()],
        splitMethod: "Equal",
        groupId: group._id.toString(),
        splitValues: [],
        payeeId: payer._id.toString(),
      })
    ).rejects.toThrow("30 characters");
  });

  test("rejects negative or zero amount", async () => {
    await expect(
      createExpense({
        totalAmount: -50,
        description: "Negative",
        participants: [participant1._id.toString(), participant2._id.toString()],
        splitMethod: "Equal",
        groupId: group._id.toString(),
        splitValues: [],
        payeeId: payer._id.toString(),
      })
    ).rejects.toThrow("greater than zero");
  });

  test("rejects fewer than 2 unique participants", async () => {
    await expect(
      createExpense({
        totalAmount: 100,
        description: "Solo",
        participants: [participant1._id.toString()],
        splitMethod: "Equal",
        groupId: group._id.toString(),
        splitValues: [],
        payeeId: payer._id.toString(),
      })
    ).rejects.toThrow();
  });

  test("rejects duplicate expense", async () => {
    const expenseData = {
      totalAmount: 500,
      description: "Unique Exp",
      participants: [participant1._id.toString(), participant2._id.toString()],
      splitMethod: "Equal",
      groupId: group._id.toString(),
      splitValues: [],
      payeeId: payer._id.toString(),
    };

    await createExpense(expenseData); // first creation
    await expect(createExpense(expenseData)).rejects.toThrow("Duplicate");
  });
});

// ─── getGroupExpenses ─────────────────────────────────────────────────────────

describe("getGroupExpenses", () => {
  test("returns empty array (not 404) when group has no expenses", async () => {
    const emptyGroup = await Group.create({
      name: "Empty Group",
      type: "Event",
      members: [payer._id],
      createdBy: payer._id,
    });

    const result = await getGroupExpenses(emptyGroup._id.toString());
    expect(result).toHaveProperty("expenses");
    expect(result.expenses).toEqual([]);
  });

  test("returns expenses belonging to the group", async () => {
    const result = await getGroupExpenses(group._id.toString());
    expect(result.expenses.length).toBeGreaterThan(0);
    result.expenses.forEach((e) => {
      expect(e.groupId.toString()).toBe(group._id.toString());
    });
  });

  test("rejects invalid group ID format", async () => {
    await expect(getGroupExpenses("bad-id")).rejects.toThrow();
  });
});

// ─── getUserExpenses ──────────────────────────────────────────────────────────

describe("getUserExpenses", () => {
  test("includes expenses where the user is the payer", async () => {
    // payer created expenses in the createExpense tests above
    const result = await getUserExpenses(payer._id.toString());
    expect(result.expenses.length).toBeGreaterThan(0);
    // All returned expenses should list the payer
    result.expenses.forEach((e) => {
      const payerMatch = e.payer._id.toString() === payer._id.toString();
      const participantMatch = e.participants.some(
        (p) => p._id.toString() === payer._id.toString()
      );
      expect(payerMatch || participantMatch).toBe(true);
    });
  });
});
