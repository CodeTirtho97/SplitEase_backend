const TestSequencer = require("@jest/test-sequencer").default;

// Run order:
//   1. Unit tests (no DB) — splitCalculator, debtSimplifier
//   2. Auth integration — must run before profile (profile relies on same DB)
//   3. Profile integration
//   4. Service tests — group, expense, transaction
class CustomSequencer extends TestSequencer {
  sort(tests) {
    const order = (path) => {
      if (path.includes("splitCalculator")) return 0;
      if (path.includes("debtSimplifier")) return 1;
      if (path.includes("auth.test")) return 2;
      if (path.includes("profile.test")) return 3;
      if (path.includes("group.test")) return 4;
      if (path.includes("expense.test")) return 5;
      if (path.includes("transaction.test")) return 6;
      return 99;
    };

    return [...tests].sort((a, b) => order(a.path) - order(b.path));
  }
}

module.exports = CustomSequencer;
