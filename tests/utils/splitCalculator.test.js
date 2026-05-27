const mongoose = require("mongoose");
const { calculateSplitDetails } = require("../../utils/splitCalculator");

// Generate real ObjectId strings for test participants
const ids = Array.from({ length: 3 }, () =>
  new mongoose.Types.ObjectId().toString()
);
const [p1, p2, p3] = ids;

describe("calculateSplitDetails — Equal split", () => {
  test("divides amount equally among all participants", () => {
    const result = calculateSplitDetails("Equal", 300, [p1, p2, p3], []);
    expect(result).toHaveLength(3);
    result.forEach((s) => {
      expect(s.amountOwed).toBeCloseTo(100, 5);
    });
  });

  test("handles two participants", () => {
    const result = calculateSplitDetails("Equal", 100, [p1, p2], []);
    expect(result[0].amountOwed).toBeCloseTo(50, 5);
  });

  test("attaches the correct userId", () => {
    const result = calculateSplitDetails("Equal", 90, [p1, p2, p3], []);
    const resultIds = result.map((s) => s.userId.toString());
    expect(resultIds).toContain(p1);
    expect(resultIds).toContain(p2);
    expect(resultIds).toContain(p3);
  });
});

describe("calculateSplitDetails — Percentage split", () => {
  test("allocates amounts by percentage", () => {
    const splitValues = [
      { userId: p1, percentage: 50 },
      { userId: p2, percentage: 30 },
      { userId: p3, percentage: 20 },
    ];
    const result = calculateSplitDetails("Percentage", 200, [p1, p2, p3], splitValues);
    expect(result[0].amountOwed).toBeCloseTo(100, 5);
    expect(result[1].amountOwed).toBeCloseTo(60, 5);
    expect(result[2].amountOwed).toBeCloseTo(40, 5);
  });

  test("accepts valid float percentages that sum to 100 (33.33 + 33.33 + 33.34)", () => {
    const splitValues = [
      { userId: p1, percentage: 33.33 },
      { userId: p2, percentage: 33.33 },
      { userId: p3, percentage: 33.34 },
    ];
    // Should NOT throw — uses Math.abs tolerance, not strict equality
    expect(() =>
      calculateSplitDetails("Percentage", 100, [p1, p2, p3], splitValues)
    ).not.toThrow();
  });

  test("rejects percentages that don't sum to 100", () => {
    const splitValues = [
      { userId: p1, percentage: 50 },
      { userId: p2, percentage: 40 },
    ];
    expect(() =>
      calculateSplitDetails("Percentage", 100, [p1, p2], splitValues)
    ).toThrow("Total percentage must be exactly 100%");
  });

  test("rejects mismatched splitValues length", () => {
    const splitValues = [{ userId: p1, percentage: 100 }];
    expect(() =>
      calculateSplitDetails("Percentage", 100, [p1, p2], splitValues)
    ).toThrow("Each participant must have a percentage defined");
  });

  test("rejects invalid userId in splitValues", () => {
    const splitValues = [
      { userId: "bad-id", percentage: 50 },
      { userId: p2, percentage: 50 },
    ];
    expect(() =>
      calculateSplitDetails("Percentage", 100, [p1, p2], splitValues)
    ).toThrow();
  });
});

describe("calculateSplitDetails — Custom split", () => {
  test("allocates the specified amounts", () => {
    const splitValues = [
      { userId: p1, amount: 70 },
      { userId: p2, amount: 30 },
    ];
    const result = calculateSplitDetails("Custom", 100, [p1, p2], splitValues);
    expect(result[0].amountOwed).toBe(70);
    expect(result[1].amountOwed).toBe(30);
  });

  test("accepts float amounts with minor rounding error (0.009 tolerance)", () => {
    // 33.33 + 33.33 + 33.34 = 100.00 — should NOT throw
    const splitValues = [
      { userId: p1, amount: 33.33 },
      { userId: p2, amount: 33.33 },
      { userId: p3, amount: 33.34 },
    ];
    expect(() =>
      calculateSplitDetails("Custom", 100, [p1, p2, p3], splitValues)
    ).not.toThrow();
  });

  test("rejects amounts that don't sum to totalAmount", () => {
    const splitValues = [
      { userId: p1, amount: 60 },
      { userId: p2, amount: 20 },
    ];
    expect(() =>
      calculateSplitDetails("Custom", 100, [p1, p2], splitValues)
    ).toThrow("Total split amount must match total expense amount");
  });

  test("rejects mismatched splitValues length", () => {
    const splitValues = [{ userId: p1, amount: 100 }];
    expect(() =>
      calculateSplitDetails("Custom", 100, [p1, p2], splitValues)
    ).toThrow("Each participant must have a custom amount defined");
  });
});

describe("calculateSplitDetails — Invalid method", () => {
  test("throws on unknown split method", () => {
    expect(() =>
      calculateSplitDetails("Halves", 100, [p1, p2], [])
    ).toThrow("Invalid split method");
  });
});
