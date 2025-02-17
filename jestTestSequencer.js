const TestSequencer = require("@jest/test-sequencer").default;

class CustomSequencer extends TestSequencer {
  sort(tests) {
    // Ensure auth.test.js runs before profile.test.js
    return tests.sort((a, b) => {
      if (a.path.includes("auth.test.js")) return -1;
      if (b.path.includes("auth.test.js")) return 1;
      return 0;
    });
  }
}

module.exports = CustomSequencer;
