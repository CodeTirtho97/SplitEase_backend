// routes/authRoutes.js
const express = require("express");
const passport = require("passport");
const cors = require("cors");
const {
  signupUser,
  loginUser,
  logoutUser, // Add the new logout function
  googleAuthCallback,
  forgotPassword,
  resetPassword,
} = require("../services/authService");
const protect = require("../middleware/authMiddleware");
const { rateLimiter } = require("../config/redis"); // Add rate limiting

const router = express.Router();

// Apply rate limiting to auth routes (5 attempts per minute)
const authRateLimiter = rateLimiter(
  5,
  60,
  "Too many login attempts, please try again later"
);

// ✅ Form-Based Signup & Login with rate limiting
router.post("/signup", authRateLimiter, signupUser);
router.post("/login", authRateLimiter, loginUser);

// ✅ New Logout Route
router.post("/logout", protect, logoutUser);

// ✅ Google OAuth Routes
router.get(
  "/google/login",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// ✅ Google OAuth Callback
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

// ✅ Forgot Password Route
router.post("/forgot-password", authRateLimiter, forgotPassword);

// ✅ Reset Password Route
router.post("/reset-password", authRateLimiter, resetPassword);

router.post("/validate-token", protect, (req, res) => {
  // If the protect middleware passed, token is valid
  res.json({ valid: true, userId: req.user.id });
});

// ✅ Protected Route (For Testing JWT Token)
router.get("/protected", protect, (req, res) => {
  res.json({ message: "Access granted", user: req.user });
});

module.exports = router;
