const {
  simplifyDebts,
  calculateDebtReduction,
  buildSettlementSummary,
} = require("../../utils/debtSimplifier");

describe("simplifyDebts", () => {
  test("returns empty array for no debts", () => {
    expect(simplifyDebts([])).toEqual([]);
    expect(simplifyDebts(null)).toEqual([]);
    expect(simplifyDebts(undefined)).toEqual([]);
  });

  test("single debt — no simplification needed", () => {
    const result = simplifyDebts([{ from: "Alice", to: "Bob", amount: 50 }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ from: "Alice", to: "Bob", amount: 50 });
  });

  test("circular debt A→B and B→A cancels out", () => {
    const rawDebts = [
      { from: "Alice", to: "Bob", amount: 100 },
      { from: "Bob", to: "Alice", amount: 100 },
    ];
    // Net balances are zero — no transactions needed
    const result = simplifyDebts(rawDebts);
    expect(result).toHaveLength(0);
  });

  test("three-way chain A→B, B→C reduces to A→C", () => {
    // Alice owes Bob 50, Bob owes Carol 50 → Alice pays Carol 50
    const rawDebts = [
      { from: "Alice", to: "Bob", amount: 50 },
      { from: "Bob", to: "Carol", amount: 50 },
    ];
    const result = simplifyDebts(rawDebts);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ from: "Alice", to: "Carol", amount: 50 });
  });

  test("classic 3-person split: 6 naive transactions → at most 2", () => {
    // Alice, Bob, Carol each paid and owe various amounts
    const rawDebts = [
      { from: "Alice", to: "Bob", amount: 20 },
      { from: "Alice", to: "Carol", amount: 30 },
      { from: "Bob", to: "Alice", amount: 10 },
      { from: "Bob", to: "Carol", amount: 40 },
      { from: "Carol", to: "Alice", amount: 15 },
      { from: "Carol", to: "Bob", amount: 5 },
    ];
    const result = simplifyDebts(rawDebts);
    expect(result.length).toBeLessThanOrEqual(2);

    // Verify net balances are preserved
    const netBefore = computeNetBalances(rawDebts);
    const netAfter = computeNetBalances(result);
    for (const person of Object.keys(netBefore)) {
      expect(netAfter[person] ?? 0).toBeCloseTo(netBefore[person], 2);
    }
  });

  test("all amounts are non-negative", () => {
    const rawDebts = [
      { from: "A", to: "B", amount: 30 },
      { from: "B", to: "C", amount: 20 },
      { from: "C", to: "A", amount: 10 },
    ];
    const result = simplifyDebts(rawDebts);
    result.forEach((t) => expect(t.amount).toBeGreaterThan(0));
  });

  test("dust amounts (< 0.001) are ignored", () => {
    // The third debt is essentially zero and should be dropped
    const rawDebts = [
      { from: "A", to: "B", amount: 100 },
      { from: "B", to: "A", amount: 100 },
      { from: "C", to: "D", amount: 0.0001 },
    ];
    const result = simplifyDebts(rawDebts);
    expect(result).toHaveLength(0);
  });

  test("large group — always fewer or equal transactions than naive", () => {
    const names = ["Alice", "Bob", "Carol", "Dave", "Eve"];
    const rawDebts = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        rawDebts.push({ from: names[i], to: names[j], amount: (i + 1) * 10 });
      }
    }
    const result = simplifyDebts(rawDebts);
    expect(result.length).toBeLessThanOrEqual(rawDebts.length);
  });
});

describe("calculateDebtReduction", () => {
  test("returns 0 when original count is 0", () => {
    expect(calculateDebtReduction(0, 0)).toBe(0);
  });

  test("computes correct percentage", () => {
    expect(calculateDebtReduction(10, 3)).toBe(70);
    expect(calculateDebtReduction(5, 5)).toBe(0);
    expect(calculateDebtReduction(4, 0)).toBe(100);
  });
});

describe("buildSettlementSummary", () => {
  test("formats transactions into readable strings", () => {
    const optimized = [
      { from: "u1", to: "u2", amount: 50 },
      { from: "u3", to: "u1", amount: 25 },
    ];
    const nameMap = { u1: "Alice", u2: "Bob", u3: "Carol" };
    const summary = buildSettlementSummary(optimized, nameMap, "INR");

    expect(summary[0]).toBe("Alice pays Bob INR 50");
    expect(summary[1]).toBe("Carol pays Alice INR 25");
  });

  test("falls back to userId when name not in map", () => {
    const optimized = [{ from: "u1", to: "u2", amount: 10 }];
    const summary = buildSettlementSummary(optimized, {});
    expect(summary[0]).toContain("u1");
    expect(summary[0]).toContain("u2");
  });

  test("omits currency prefix when not provided", () => {
    const optimized = [{ from: "u1", to: "u2", amount: 10 }];
    const summary = buildSettlementSummary(optimized, { u1: "Alice", u2: "Bob" });
    expect(summary[0]).toBe("Alice pays Bob 10");
  });
});

// ─── helpers ──────────────────────────────────────────────────────────────────

function computeNetBalances(debts) {
  const balances = {};
  for (const { from, to, amount } of debts) {
    balances[from] = (balances[from] || 0) - amount;
    balances[to] = (balances[to] || 0) + amount;
  }
  return balances;
}
