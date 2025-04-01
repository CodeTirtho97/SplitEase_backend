const User = require("../models/User");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const sendEmail = require("../utils/sendEmail");
const jwt = require("jsonwebtoken");
const { storeSession, deleteSession } = require("../config/redis");
require("dotenv").config();

// ✅ Generate JWT Token with Redis session storage
const generateToken = async (userId) => {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  // Store token in Redis for validation and easy invalidation
  try {
    await storeSession(userId, token);
  } catch (error) {
    console.error("Redis session storage failed:", error);
    // Continue anyway as JWT can work without Redis
  }

  return token;
};

// ✅ Signup Function
const signupUser = async (req, res) => {
  try {
    const { fullName, email, gender, password, confirmPassword } = req.body;

    if (!fullName || !email || !password || !confirmPassword || !gender) {
      return res.status(400).json({ message: "All fields are required!" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use!" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const newUser = await User.create({ fullName, email, gender, password });

    // Generate token with Redis session
    const token = await generateToken(newUser._id);

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        userId: newUser._id,
        fullName: newUser.fullName,
        email: newUser.email,
        gender: newUser.gender,
      },
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

    // Generate token with Redis session
    const token = await generateToken(user._id);

    res.json({
      message: "Login successful",
      token,
      user: {
        userId: user._id,
        fullName: user.fullName,
        email: user.email,
        gender: user.gender,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Logout Function (new)
const logoutUser = async (req, res) => {
  try {
    const userId = req.user.id;

    // Delete session from Redis
    await deleteSession(userId);

    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Google OAuth Callback (Updated for frontend integration)
const googleAuthCallback = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Google authentication failed" });
    }

    const user = req.user.user;
    const token = req.user.token;

    // Store token in Redis for the Google OAuth user too
    try {
      await storeSession(user._id, token);
    } catch (error) {
      console.error("Redis session storage failed for Google user:", error);
      // Continue anyway as JWT can work without Redis
    }

    // Define the frontend URL based on environment
    const frontendUrl =
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL
        : "http://localhost:3000";

    // BASE64 ENCODE THE USER DATA
    const encodedUser = Buffer.from(JSON.stringify(user)).toString("base64");

    // Redirect with data in URL parameters
    return res.redirect(
      `${frontendUrl}/auth/google/callback?token=${token}&userData=${encodedUser}`
    );
  } catch (error) {
    console.error("Google Auth Callback Error:", error);
    const frontendUrl =
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL
        : "http://localhost:3000";
    return res.redirect(`${frontendUrl}/login?error=auth_failed`);
  }
};

// ✅ Forgot Password Functionality
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({
      email: { $regex: `^${normalizedEmail}$`, $options: "i" },
    });

    if (!user) {
      return res.status(404).json({ message: "Email Not Registered!" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // Expires in 15 mins
    await user.save();

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

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        message: "Choose a different password than the previous one!",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Delete any existing sessions when resetting password (security measure)
    try {
      await deleteSession(user._id.toString());
    } catch (error) {
      console.error("Redis session deletion failed:", error);
      // Continue anyway
    }

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          password: hashedPassword,
          resetPasswordToken: null,
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
  logoutUser,
  googleAuthCallback,
  forgotPassword,
  resetPassword,
};
