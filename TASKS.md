# SplitEase Backend — Audit Task List

> Delete this file once all tasks are completed.

---

## 🔴 CRITICAL — Broken Functionality Right Now

- [x] **C1. Socket.IO event handlers are empty stubs** — `config/socket.js:130-144`
  All 4 Redis Pub/Sub channel handlers (`expense_events`, `transaction_events`, `group_events`, `notification_events`) contain only `// Your existing handler code`. Events are published to Redis but never forwarded to Socket.IO clients. Real-time is completely non-functional.

- [x] **C2. `ExchangeRate.js` model will cause a Mongoose model collision** — `models/ExchangeRate.js:10`
  Exports `mongoose.model("Expense", exchangeRateSchema)` — `"Expense"` is already registered in `models/Expense.js`. Any code path that imports this file will throw `"Cannot overwrite Expense model once compiled"`. The file is also never imported anywhere — it's dead code with a live grenade inside.

- [x] **C3. `viewGroupDetails` queries wrong transaction status** — `services/groupService.js:239`
  Queries `status: "Completed"` but the Transaction schema enum is `["Pending", "Success", "Failed"]`. `"Completed"` doesn't exist. `completedTransactions` will always return an empty array.

- [x] **C4. `getExpenseBreakdown` ignores the URL currency param** — `services/expenseService.js:812`
  Route is `/breakdown/:currency` (path param) but service reads `req.query.currency`. The path param is silently discarded; the endpoint always defaults to `"INR"` regardless of what currency you pass.

- [x] **C5. Duplicate cron job runs exchange rate update twice at midnight** — `services/expenseService.js:121` + `utils/cronJobs.js:5`
  Both files schedule `cron.schedule("0 0 * * *", ...)` for exchange rates. Both are loaded by `server.js`. The update fires twice at midnight every day.

- [x] **C6. bcrypt-hashed transaction ID breaks URL routing** — `models/Transaction.js:63` + `routes/transactionRoutes.js:222`
  Transaction IDs are bcrypt hashes like `$2a$10$xyz.../abc`. These contain `/` and `$` characters which break Express URL param parsing. Settlement endpoint `PUT /api/transactions/:transactionId/settle` is effectively broken.

- [x] **C7. `getRecentTransactions` (dashboard) throws if no exchange rates exist** — `services/dashboardService.js:372-378`
  If exchange rates haven't been seeded yet (fresh deployment), it throws `"No exchange rates found in database"`. `getDashboardStats` handles this gracefully; `getRecentTransactions` crashes the entire dashboard endpoint.

---

## 🟠 HIGH — Significant Bugs / Security Issues

- [x] **H1. `passport.initialize()` registered AFTER route handlers** — `server.js:96`
  `app.use(passport.initialize())` is called at line 96, after `dashboardRoutes` (line 93) and `healthRoutes` (line 94) are already mounted. Passport middleware must come before any route that uses it.

- [x] **H2. Security headers middleware registered AFTER routes** — `server.js:147-151`
  The `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers are set in a middleware added after all route registrations. They will never be applied to any API response.

- [x] **H3. `helmet` installed but never imported or used** — `package.json:39`, `server.js` (absent)
  `helmet` is in production dependencies but `server.js` never calls `app.use(helmet())`. None of the security headers helmet provides (CSP, HSTS, X-Frame-Options, etc.) are active.

- [x] **H4. User enumeration in `forgotPassword`** — `services/authService.js:163-167`
  Returns `404 { message: "Email Not Registered!" }` for unknown emails. Attackers can enumerate which emails have accounts. Should always return `200` with the same message regardless.

- [x] **H5. No input validation middleware on any route**
  No `express-validator` or `zod` applied at the route layer. Validation is scattered inside service functions as manual checks. Malformed ObjectIds, wrong types, and missing fields can reach DB queries without early rejection.

- [x] **H6. No database indexes on any model**
  Every query on `groupId`, `userId`, `expenseId`, `sender`, `receiver` is a full collection scan. Missing critical indexes on: `User.email`, `Expense.groupId`, `Expense.participants`, `Transaction.sender+status`, `Transaction.expenseId`, `Group.members`.

- [x] **H7. `editGroup` overwrites members with `undefined` if not provided** — `services/groupService.js:336-341`
  `$set: { description, completed, members }` — if `members` is not in the request body, this sets `members: undefined` and wipes the group's member list. Should only set fields that are actually present in the body.

- [x] **H8. `getUserExpenses` misses expenses where user is the payer** — `services/expenseService.js:411`
  Queries `Expense.find({ participants: req.user.id })` only. When creating an expense, the payer is excluded from `participants`. The payer's own expenses never appear in their expense list. `getRecentExpenses` correctly uses `$or: [{ participants }, { payer }]`.

- [x] **H9. `getGroupExpenses` returns 404 when a group has no expenses** — `services/expenseService.js:394-397`
  An empty expense list is not an error. Returns 404 causing the frontend to show an error state for valid empty groups. Should return `200` with `expenses: []`.

- [x] **H10. Cache not applied to expense routes despite Swagger docs claiming it** — `routes/expenseRoutes.js`
  Swagger says `/expenses/summary` is "cached for 5 min", `/expenses/recent` "cached for 2 min", `/expenses/breakdown/:currency` "cached for 5 min". None of them have `cacheMiddleware()` in their route definitions.

- [x] **H11. Inconsistent bcrypt salt rounds across the codebase**
  `models/User.js:43` uses 12 rounds. `services/authService.js:221` (reset password) and `services/profileService.js:151` (change password) use 10 rounds. Should be 12 everywhere.

- [x] **H12. `ExchangeRate` schema defined inline in `expenseService.js`** — `services/expenseService.js:17-23`
  Schema and model are defined inside a service file at module level. Combined with the dead `models/ExchangeRate.js`, this is an architectural mess. The model belongs in `models/`.

- [x] **H13. No rate limiting on profile, group, or expense routes**
  Rate limiting is only on auth endpoints. Profile updates, group creation, expense creation, and payment operations have no throttling.

- [x] **H14. `server.js` graceful shutdown never closes the HTTP server** — `server.js:154-159`
  SIGINT handler calls `shutdown()` (Redis) and `process.exit(0)` but never calls `server.close()`. In-flight requests are abruptly terminated.

- [x] **H15. `validateObjectId` middleware exists but is applied to no routes** — `middleware/validateObjectId.js`
  Built and never wired up. Routes do ad-hoc `mongoose.Types.ObjectId.isValid()` checks individually.

---

## 🟡 MEDIUM — Logic Bugs / Code Quality

- [x] **M1. `settleTransaction` has a dummy 10% random failure** — `services/transactionService.js:127`
  `const isPaymentSuccessful = Math.random() > 0.1` randomly rejects 10% of settlement attempts with no real payment gateway. Users can't reliably settle debts.

- [x] **M2. Percentage split uses strict equality on floats** — `utils/splitCalculator.js:37`
  `if (totalPercentage !== 100)` fails for valid splits like 33.33 + 33.33 + 33.34 = 99.99999... due to IEEE 754. Should be `Math.abs(totalPercentage - 100) > 0.01`.

- [x] **M3. Custom split uses strict equality on floats** — `utils/splitCalculator.js:60`
  Same issue: `if (totalCustomAmount !== totalAmount)`. Floating-point addition of split amounts will rarely equal the original amount exactly.

- [x] **M4. `buildSettlementSummary` hardcodes ₹ symbol** — `utils/debtSimplifier.js:101`
  `₹${amount}` is hardcoded. The debt summary doesn't account for the currency context of the debts being simplified.

- [x] **M5. `dashboardService.js` has 30+ debug `console.log` calls** — throughout `services/dashboardService.js`
  Every calculation step logs to stdout. Floods server logs in production with internal computation details.

- [x] **M6. `profileService.js` logs friend list to console** — `services/profileService.js:90`
  `console.log("Populated friends:", user.friends)` is a leftover debug statement that dumps PII to server logs on every profile fetch.

- [x] **M7. `sendEmail` creates a new Nodemailer transporter on every call** — `utils/sendEmail.js:3-10`
  `nodemailer.createTransport(...)` is called inside the function, meaning a new SMTP connection is established for every password reset email. Should be a singleton outside the function.

- [x] **M8. Duplicate CORS configuration** — `server.js:30-50` and `server.js:98-118`
  CORS is applied globally AND again specifically on `/api/auth`. The second block is redundant and confusing.

- [x] **M9. `getRecentTransactions` in `dashboardService.js` checks if its own functions loaded** — `services/dashboardService.js:446-452`
  ```js
  if (!getDashboardStats || !getRecentTransactions) { throw new Error(...) }
  ```
  This check can never be true (variables are in the same scope). It's dead noise.

- [x] **M10. `forgotPassword` stores reset token in plaintext** — `services/authService.js:169`
  Token stored as raw hex in `resetPasswordToken`. Should store `crypto.createHash('sha256').update(token).digest('hex')` and compare the hash on reset.

- [x] **M11. Reset token expiry is 15 minutes but Swagger says 1 hour** — `services/authService.js:171`
  `Date.now() + 15 * 60 * 1000` is 15 minutes. Swagger doc for `forgot-password` says "1-hour expiry". Inconsistency between code and docs.

- [x] **M12. `server.js` always starts HTTP server even when imported by tests** — `server.js:165`
  `server.listen(PORT, ...)` runs unconditionally on every import. Causes "address already in use" errors when multiple test suites run. Should be guarded.

- [x] **M13. `cronJobs.js` silently swallows errors** — `utils/cronJobs.js:9-11`
  The catch block inside the cron callback is empty (commented-out). Failed exchange rate updates are invisible.

---

## 🔵 STRUCTURE — Architecture & Project Organization

- [x] **S1. No Controller layer — services directly handle `req`/`res`**
  Every service function takes `(req, res)` and calls `res.json()` directly. Services are impossible to unit test without mocking the HTTP layer. Proper structure: `Route → Controller (HTTP) → Service (business logic) → Model`.

- [x] **S2. No shared `constants.js` file**
  Currency list `["INR", "USD", "EUR", "GBP", "JPY"]`, group types `["Travel", "Household", "Event", "Work", "Friends"]`, payment modes `["UPI", "PayPal", "Stripe"]`, and expense types are hardcoded in models, services, and validators separately. One change requires updates in 5+ files.

- [x] **S3. No structured logging (Winston/Pino)**
  Raw `console.log` throughout. No log levels, no timestamps in log format, no way to differentiate info vs error in production.

- [x] **S4. `expenseService.js` is 941 lines — needs to be split**
  Contains exchange rate management, expense CRUD, analytics/summary, and a cron job. Should be broken into `expenseService.js`, `exchangeRateService.js`, and `analyticsService.js`.

- [x] **S5. No centralized error handling classes**
  Errors are thrown as raw `new Error("message")` strings. No `AppError`, `ValidationError`, `NotFoundError` class hierarchy. The global error handler can't differentiate operational errors from programmer errors.

- [x] **S6. Unused dead code and zombie packages**
  - `models/ExchangeRate.js` — never imported, has model collision bug
  - `middleware/validateObjectId.js` — never used in routes
  - `bullmq` — in package.json, never used
  - `apollo-server-express` + `graphql` — in package.json, never used
  - `@paypal/checkout-server-sdk` — in package.json, never used
  - `crypto` — in package.json as a dependency, it's a Node.js built-in (no install needed)

- [x] **S7. Cron job registered in two places**
  `expenseService.js:121` registers the cron at module load AND `cronJobs.js:5` registers the same cron. Both loaded by `server.js`. Only `cronJobs.js` should own scheduled jobs.

---

## ⚪ LOW — Minor / Polish

- [x] **L1. `Group.js` has no `updatedAt` field** — missing `timestamps: true`

- [x] **L2. `Expense.js` has manual `createdAt` field** instead of `timestamps: true` — and no `updatedAt`

- [x] **L3. `Transaction.js` manually manages `updatedAt` in pre-save hook** instead of `timestamps: true`

- [x] **L4. `addFriend` is one-directional** — `services/profileService.js:246`
  Only adds to the requesting user's friends list. The other user doesn't get a reciprocal entry.

- [x] **L5. Commented-out code throughout**
  `User.js:31` has `//groups` field. Dozens of commented `console.log` blocks in every service. Should be cleaned up.

- [x] **L6. Inconsistent error response shape**
  Some return `{ message: "..." }`, others `{ error: "...", details: "..." }`, some `{ message: "...", error: "..." }`. Needs a single standard shape.

- [x] **L7. `updateProfile` double-reads `req.body`** — `services/profileService.js:56-65`
  Destructures `{ fullName, gender }` at line 56 but then reads `req.body.fullName` again at line 63. The destructured variables are unused.

- [x] **L8. `passport.js` creates Google users with unhashed random password** — `config/passport.js:30`
  `password: crypto.randomBytes(16).toString("hex")` is stored before the pre-save hook fires. Works but is confusing.

- [x] **L9. `.env` committed to git — rotate all secrets**
  MongoDB URI, Redis URL, Google OAuth client secret, Cloudinary API secret, JWT secret, and email credentials are all in git history. All must be rotated.

---

## 🧪 Test Coverage Gaps

- [x] **T1. No tests for `splitCalculator.js`** — float equality bugs (M2/M3) would be caught immediately

- [x] **T2. No tests for `debtSimplifier.js`** — edge cases: zero debts, single person, circular debts, already balanced

- [x] **T3. No tests for `expenseService.js`** — expense creation, cascading delete, summary calculation

- [x] **T4. No tests for `transactionService.js`** — settlement flow, authorization check, expense status update

- [x] **T5. No tests for `groupService.js`** — create, edit, delete, debt summary endpoint

---

## Summary

| Severity | Count |
|---|---|
| 🔴 Critical | 7 |
| 🟠 High | 15 |
| 🟡 Medium | 13 |
| 🔵 Structural | 7 |
| ⚪ Low | 9 |
| 🧪 Tests | 5 |
| **Total** | **56** |
