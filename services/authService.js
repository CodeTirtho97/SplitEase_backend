const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
require("dotenv").config();

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// Signup Function
const signupUser = async (req, res) => {
  try {
    const { fullName, email, gender, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Create new user
    const newUser = await User.create({ fullName, email, gender, password });

    res.status(201).json({
      message: "User registered successfully",
      token: generateToken(newUser._id),
      userId: newUser._id,
      fullName: newUser.fullName,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Login Function
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Verify password
    const isPasswordMatch = await user.matchPassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    res.json({
      message: "Login successful",
      token: generateToken(user._id),
      userId: user._id,
      fullName: user.fullName,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const googleAuthCallback = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Google authentication failed" });
    }

    res.json({
      message: "Google authentication successful",
      token: req.user.token,
      userId: req.user.user._id,
      fullName: req.user.user.fullName,
      profilePic: req.user.user.profilePic,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

module.exports = { signupUser, loginUser, googleAuthCallback };
