/**
 * Debt Simplification — Minimum Cash Flow Algorithm
 *
 * Problem: Given a list of raw debts {from, to, amount}, find the minimum
 * number of transactions to settle all debts completely.
 *
 * Approach (greedy net-balance):
 *   1. Compute each person's net balance: credit received minus debt owed.
 *   2. Split participants into creditors (net > 0) and debtors (net < 0).
 *   3. Repeatedly match the largest debtor with the largest creditor:
 *      - The settlement amount is min(|debtor's balance|, creditor's balance).
 *      - Whichever side is fully resolved moves to the next person.
 *   4. Repeat until all balances reach zero.
 *
 * Why it works: Any valid settlement must zero out every person's net balance.
 * Matching extremes greedily achieves this in at most (N-1) transactions for
 * N participants, versus N*(N-1) in the naive pairwise model.
 *
 * Complexity: O(N^2) worst-case; typical group sizes make this negligible.
 */

const EPSILON = 0.001; // float tolerance

/**
 * Simplify a list of raw debts into the minimum equivalent set.
 *
 * @param {Array<{from: string, to: string, amount: number}>} rawDebts
 * @returns {Array<{from: string, to: string, amount: number}>}  optimized settlements
 */
const simplifyDebts = (rawDebts) => {
  if (!rawDebts || rawDebts.length === 0) return [];

  // Step 1: Compute net balance per person
  const balances = {};
  for (const { from, to, amount } of rawDebts) {
    balances[from] = (balances[from] || 0) - amount; // debtor
    balances[to] = (balances[to] || 0) + amount;     // creditor
  }

  // Step 2: Separate into creditors and debtors, ignoring dust amounts
  const creditors = []; // owed money  (balance > 0)
  const debtors = [];   // owe money   (balance < 0)

  for (const [person, balance] of Object.entries(balances)) {
    if (balance > EPSILON) creditors.push({ person, amount: balance });
    else if (balance < -EPSILON) debtors.push({ person, amount: -balance });
  }

  // Step 3: Greedy matching — largest debtor vs largest creditor
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const optimized = [];
  let i = 0; // debtor pointer
  let j = 0; // creditor pointer

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const settle = Math.min(debtor.amount, creditor.amount);

    optimized.push({
      from: debtor.person,
      to: creditor.person,
      amount: Math.round(settle * 100) / 100,
    });

    debtor.amount -= settle;
    creditor.amount -= settle;

    if (debtor.amount < EPSILON) i++;
    if (creditor.amount < EPSILON) j++;
  }

  return optimized;
};

/**
 * Calculate the percentage reduction in transaction count.
 *
 * @param {number} originalCount   - raw/naive transaction count
 * @param {number} optimizedCount  - simplified transaction count
 * @returns {number} reduction percentage (0-100)
 */
const calculateDebtReduction = (originalCount, optimizedCount) => {
  if (originalCount === 0) return 0;
  return Math.round(((originalCount - optimizedCount) / originalCount) * 100);
};

/**
 * Build a human-readable summary of the settlement plan.
 * Useful for debugging or plain-text API responses.
 *
 * @param {Array<{from: string, to: string, amount: number}>} optimized
 * @param {Object} nameMap  - { userId: fullName }
 * @returns {string[]}
 */
const buildSettlementSummary = (optimized, nameMap = {}) =>
  optimized.map(
    ({ from, to, amount }) =>
      `${nameMap[from] || from} pays ${nameMap[to] || to} ₹${amount}`
  );

module.exports = { simplifyDebts, calculateDebtReduction, buildSettlementSummary };