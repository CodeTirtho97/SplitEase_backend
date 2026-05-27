// routes/authRoutes.js
const express = require("express");
const passport = require("passport");
const cors = require("cors");
const {
  signup: signupUser,
  login: loginUser,
  logout: logoutUser,
  googleCallback: googleAuthCallback,
  forgotPasswordHandler: forgotPassword,
  resetPasswordHandler: resetPassword,
} = require("../controllers/authController");
const protect = require("../middleware/authMiddleware");
const { rateLimiter } = require("../config/redis");

const router = express.Router();

const authRateLimiter = rateLimiter(
  5,
  60,
  "Too many login attempts, please try again later"
);

/**
 * @swagger
 * /api/auth/signup:
 *   post:
 *     summary: Register a new user
 *     description: >
 *       Creates a new SplitEase account. The password is bcrypt-hashed
 *       (12 salt rounds) before storage. A JWT session token is returned
 *       immediately so the user can start using the app without a separate
 *       login step. Rate-limited to 5 requests per minute per IP.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, email, password, confirmPassword, gender]
 *             properties:
 *               fullName:
 *                 type: string
 *                 maxLength: 30
 *                 example: Tirthoraj Bhattacharya
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 format: password
 *                 example: SecurePass@123
 *               confirmPassword:
 *                 type: string
 *                 format: password
 *                 example: SecurePass@123
 *               gender:
 *                 type: string
 *                 enum: [Male, Female, Other]
 *                 example: Male
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error (duplicate email, password mismatch, etc.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/signup", authRateLimiter, signupUser);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Log in with email and password
 *     description: >
 *       Authenticates the user and returns a JWT valid for 7 days.
 *       The token is also stored in Redis so it can be revoked on logout.
 *       Rate-limited to 5 requests per minute per IP to prevent brute-force attacks.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: SecurePass@123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Rate limit exceeded
 */
router.post("/login", authRateLimiter, loginUser);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Log out and invalidate the JWT session
 *     description: >
 *       Deletes the user's session from Redis, immediately invalidating the
 *       token even before its 7-day expiry. Subsequent requests using the
 *       same token will receive 401 Unauthorized.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
 *       401:
 *         description: No valid token provided
 */
router.post("/logout", protect, logoutUser);

/**
 * @swagger
 * /api/auth/google/login:
 *   get:
 *     summary: Initiate Google OAuth 2.0 login
 *     description: >
 *       Redirects the browser to Google's OAuth consent screen requesting
 *       `profile` and `email` scopes. After the user grants consent, Google
 *       redirects back to `/api/auth/google/callback`.
 *       **Cannot be called via Swagger UI — open in a browser tab.**
 *     tags: [Auth]
 *     security: []
 *     responses:
 *       302:
 *         description: Redirect to Google consent screen
 */
router.get(
  "/google/login",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

/**
 * @swagger
 * /api/auth/google/callback:
 *   get:
 *     summary: Google OAuth 2.0 callback
 *     description: >
 *       Handles the redirect from Google after consent. Creates a new user
 *       if the Google email has never been seen, otherwise links the Google
 *       ID to the existing account. Returns a base64-encoded user object and
 *       JWT token as query params to the frontend redirect URL.
 *     tags: [Auth]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         description: OAuth authorisation code provided by Google
 *     responses:
 *       302:
 *         description: Redirect to frontend with token and user data
 *       401:
 *         description: Google OAuth failed
 */
router.get(
  "/google/callback",
  cors({
    origin: ["http://localhost:3000", process.env.FRONTEND_URL],
    credentials: true,
    optionsSuccessStatus: 200,
  }),
  passport.authenticate("google", { session: false }),
  googleAuthCallback
);


/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request a password reset link
 *     description: >
 *       Sends an email to the provided address containing a time-limited
 *       (1-hour) password reset link. The reset token is generated with
 *       `crypto.randomBytes(32)` and stored as a hash in the database.
 *       Rate-limited to 5 requests per minute.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Reset email sent (or silently ignored if email not found, to prevent enumeration)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password reset email sent
 *       429:
 *         description: Rate limit exceeded
 */
router.post("/forgot-password", authRateLimiter, forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password using the emailed token
 *     description: >
 *       Validates the reset token (must not be expired), hashes the new
 *       password, and clears the token from the database. The token is
 *       single-use and expires 1 hour after generation.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token:
 *                 type: string
 *                 description: Reset token received in the email link
 *                 example: a3f1c9d2e8b4...
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 example: NewSecurePass@456
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/reset-password", authRateLimiter, resetPassword);

/**
 * @swagger
 * /api/auth/validate-token:
 *   post:
 *     summary: Validate a JWT token
 *     description: >
 *       Confirms that the provided Bearer token is valid and the session
 *       exists in Redis. Useful for frontend auth guards on app load.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                   example: true
 *                 userId:
 *                   type: string
 *                   example: 64b1f2c8e4b0a12345678901
 *       401:
 *         description: Token is invalid or session has been revoked
 */
router.post("/validate-token", protect, (req, res) => {
  res.json({ valid: true, userId: req.user.id });
});

/**
 * @swagger
 * /api/auth/protected:
 *   get:
 *     summary: Auth smoke-test endpoint
 *     description: Returns the decoded user from the token. Used to verify middleware is working.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Access granted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Access granted
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 */
router.get("/protected", protect, (req, res) => {
  res.json({ message: "Access granted", user: req.user });
});

module.exports = router;
