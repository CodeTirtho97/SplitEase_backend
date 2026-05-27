/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",

  // Spin up mongo-memory-server once for the entire test run
  globalSetup: "<rootDir>/tests/setup/globalSetup.js",
  globalTeardown: "<rootDir>/tests/setup/globalTeardown.js",

  // Set env vars (MONGO_URI, JWT_SECRET, etc.) before any module loads
  setupFiles: ["<rootDir>/tests/setup/setEnvVars.js"],

  // Connect mongoose + clear collections between test files
  setupFilesAfterEnv: ["<rootDir>/tests/setup/jestSetup.js"],

  // Redirect every import of config/redis to the no-op mock.
  // Applies regardless of relative depth (./config/redis, ../config/redis, etc.)
  moduleNameMapper: {
    "config/redis": "<rootDir>/tests/__mocks__/redisMock.js",
  },

  // Only discover test files inside /tests, exclude setup helpers
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/tests/setup/",
    "/tests/__mocks__/",
  ],

  // Run test suites one at a time (prevents port conflicts and keeps DB state predictable)
  testSequencer: "<rootDir>/jestTestSequencer.js",

  // Graceful shutdown — Jest will forcibly exit after all suites complete
  forceExit: true,
  detectOpenHandles: true,

  // Coverage
  collectCoverageFrom: [
    "services/**/*.js",
    "utils/**/*.js",
    "controllers/**/*.js",
    "!**/node_modules/**",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],

  verbose: true,
};
