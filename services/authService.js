const User = require("../models/User");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const sendEmail = require("../utils/sendEmail");
const jwt = require("jsonwebtoken");
require("dotenv").config();

// ✅ Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// ✅ Signup Function
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
      email: newUser.email,
      gender: newUser.gender,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Login Function
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(401).json({ message: "Invalid email or password" });

    const isPasswordMatch = await user.matchPassword(password);
    if (!isPasswordMatch)
      return res.status(401).json({ message: "Invalid email or password" });

    res.json({
      message: "Login successful",
      token: generateToken(user._id),
      userId: user._id,
      fullName: user.fullName,
      email: user.email,
      gender: user.gender,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Google OAuth Callback
const googleAuthCallback = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Google authentication failed" });
    }

    // 🔹 Generate Token (if not already generated)
    const token = req.user.token || generateJWT(req.user.user._id);

    // 🔹 Construct the frontend redirect URL with token & user data
    const frontendRedirectURL = `${
      process.env.FRONTEND_URL
    }/login?token=${token}&userId=${
      req.user.user._id
    }&fullName=${encodeURIComponent(
      req.user.user.fullName
    )}&profilePic=${encodeURIComponent(
      req.user.user.profilePic
    )}&email=${encodeURIComponent(req.user.user.email)}`;

    // 🔹 Redirect to frontend
    res.redirect(frontendRedirectURL);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Forgot Password Functionality
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Normalize email (convert to lowercase & trim spaces)
    const normalizedEmail = email.trim().toLowerCase();

    // Search for the user in a case-insensitive way
    const user = await User.findOne({
      email: { $regex: `^${normalizedEmail}$`, $options: "i" },
    });

    if (!user) {
      return res.status(404).json({ message: "Email Not Registered!" });
    }

    // Generate reset token (Example: JWT or UUID)
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // Expires in 15 mins
    await user.save();

    // Send reset email (Replace with actual email sender function)
    await sendEmail({
      to: user.email,
      subject: "Password Reset Request",
      text: `Click the link to reset your password: ${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`,
    });

    res.json({ message: "Reset link sent. Check your email!" });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Reset Password Function
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    if (!newPassword || !confirmPassword) {
      return res
        .status(400)
        .json({ message: "Both password fields are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    // 🔹 Find user by reset token and ensure token is not expired
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }, // Ensure token is valid
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    // 🔹 Check if the new password is the same as the old one
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        message: "Choose a different password than the previous one!",
      });
    }

    // 🔹 Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // 🔹 Update user's password in database
    await User.updateOne(
      { _id: user._id }, // Find by user ID
      {
        $set: {
          password: hashedPassword, // Store new hashed password
          resetPasswordToken: null, // Remove reset token
          resetPasswordExpires: null,
        },
      }
    );

    res.json({ message: "Password reset successful! Redirecting to login..." });
  } catch (error) {
    console.error("Password Reset Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

module.exports = {
  signupUser,
  loginUser,
  googleAuthCallback,
  forgotPassword,
  resetPassword,
};
