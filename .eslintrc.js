module.exports = {
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "commonjs",
  },
  rules: {
    // ── Possible errors ──────────────────────────────────────────────────────
    "no-undef": "error",
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "no-unreachable": "error",
    "no-duplicate-case": "error",

    // ── Best practices ───────────────────────────────────────────────────────
    // console.log is allowed (services use the logger, but infra files still
    // use console for low-level connection events — enforce via code review)
    "no-console": "off",
    "eqeqeq": ["error", "always"],
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-return-assign": "error",
    "no-throw-literal": "error",

    // ── Security (avoids common injection vectors) ───────────────────────────
    "no-new-func": "error",
    "no-script-url": "error",

    // ── Style (non-blocking warnings) ────────────────────────────────────────
    "prefer-const": "warn",
    "no-var": "warn",
  },
  ignorePatterns: ["node_modules/", "coverage/"],
};
