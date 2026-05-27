const User = require("../models/User");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const sendEmail = require("../utils/sendEmail");
const jwt = require("jsonwebtoken");
const { storeSession, deleteSession } = require("../config/redis");
const { ValidationError, UnauthorizedError } = require("../utils/AppError");
require("dotenv").config();

const generateToken = async (userId) => {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
  try {
    await storeSession(userId, token);
  } catch (error) {
    // JWT works without Redis; continue
  }
  return token;
};

const signupUser = async ({ fullName, email, gender, password, confirmPassword }) => {
  if (!fullName || !email || !password || !confirmPassword || !gender) {
    throw new ValidationError("All fields are required!");
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ValidationError("Email already in use!");
  }

  if (password !== confirmPassword) {
    throw new ValidationError("Passwords do not match");
  }

  const newUser = await User.create({ fullName, email, gender, password });
  const token = await generateToken(newUser._id);

  return {
    token,
    user: {
      userId: newUser._id,
      fullName: newUser.fullName,
      email: newUser.email,
      gender: newUser.gender,
    },
  };
};

const loginUser = async ({ email, password }) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const isPasswordMatch = await user.matchPassword(password);
  if (!isPasswordMatch) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const token = await generateToken(user._id);

  return {
    token,
    user: {
      userId: user._id,
      fullName: user.fullName,
      email: user.email,
      gender: user.gender,
    },
  };
};

const logoutUser = async (userId) => {
  await deleteSession(userId);
};

const processGoogleAuth = async (user, token) => {
  try {
    await storeSession(user._id, token);
  } catch (error) {
    // Continue if Redis session storage fails
  }
  return { user, token };
};

// Returns true if email found and email sent; false if email not registered.
// Never throws for missing email (anti-enumeration).
const forgotPassword = async ({ email, frontendUrl }) => {
  if (!email) {
    throw new ValidationError("Email is required");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({
    email: { $regex: `^${normalizedEmail}$`, $options: "i" },
  });

  if (!user) return false;

  const resetToken = crypto.randomBytes(32).toString("hex");
  user.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
  user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  await user.save();

  await sendEmail({
    to: user.email,
    subject: "Password Reset Request",
    text: `Click the link to reset your password: ${frontendUrl}/reset-password?token=${resetToken}`,
  });

  return true;
};

const resetPassword = async ({ token, newPassword, confirmPassword }) => {
  if (!token) {
    throw new ValidationError("Invalid or expired token");
  }
  if (!newPassword || !confirmPassword) {
    throw new ValidationError("Both password fields are required");
  }
  if (newPassword !== confirmPassword) {
    throw new ValidationError("Passwords do not match");
  }

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw new ValidationError("Invalid or expired token");
  }

  const isSamePassword = await bcrypt.compare(newPassword, user.password);
  if (isSamePassword) {
    throw new ValidationError("Choose a different password than the previous one!");
  }

  const salt = await bcrypt.genSalt(12);
  const hashedPassword = await bcrypt.hash(newPassword, salt);

  try {
    await deleteSession(user._id.toString());
  } catch (error) {
    // Continue if Redis session deletion fails
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
};

module.exports = {
  signupUser,
  loginUser,
  logoutUser,
  processGoogleAuth,
  forgotPassword,
  resetPassword,
};
