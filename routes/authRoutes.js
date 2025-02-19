const express = require("express");
const passport = require("passport");
const {
  signupUser,
  loginUser,
  googleAuthCallback,
  forgotPassword,
  resetPassword,
} = require("../services/authService");
const protect = require("../middleware/authMiddleware");

const router = express.Router();

// ✅ Form-Based Signup & Login
router.post("/signup", signupUser);
router.post("/login", loginUser);

// ✅ Google OAuth Routes (Separate for Login & Signup)
// router.get(
//   "/google/signup",
//   passport.authenticate("google", { scope: ["profile", "email"] })
// );

router.get(
  "/google/login",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// ✅ Google OAuth Callback (For Both Signup & Login)
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  googleAuthCallback
);

// ✅ Forgot Password Route
router.post("/forgot-password", forgotPassword);

// ✅ Reset Password Route
router.post("/reset-password", resetPassword);

// ✅ **Protected Route (For Testing JWT Token)**
router.get("/protected", protect, (req, res) => {
  res.json({ message: "Access granted", user: req.user });
});

module.exports = router;
