const express = require("express");
const { signupUser, loginUser } = require("../services/authService");

const router = express.Router();

// Signup Route
router.post("/signup", signupUser);

// Login Route
router.post("/login", loginUser);

const passport = require("passport");
const { googleAuthCallback } = require("../services/authService");

// Google OAuth Login
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Google OAuth Callback
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  googleAuthCallback
);

module.exports = router;
