const mongoose = require("mongoose");
const User = require("../models/User");
const cloudinary = require("../config/cloudinary");

// Upload or Update Profile Picture
const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ message: "No file uploaded. Ensure you selected an image." });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Delete old profile picture if it exists
    if (user.profilePic && user.profilePic.includes("cloudinary")) {
      const publicId = user.profilePic.split("/").pop().split(".")[0]; // Extract public ID
      await cloudinary.uploader.destroy(`profile_pics/${publicId}`);
    }

    // Update user profile with new picture URL
    user.profilePic = req.file.path;
    await user.save();

    res.status(200).json({
      message: "Profile picture updated successfully",
      profilePic: user.profilePic,
    });
  } catch (error) {
    console.error("Profile Picture Upload Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Fetch User Profile (Including Profile Pic)
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      fullName: user.fullName,
      email: user.email,
      gender: user.gender || "",
      profilePic: user.profilePic || "",
      friends: user.friends,
      paymentMethods: user.paymentMethods,
      groups: user.groups, // Groups will be auto-updated
    });
  } catch (error) {
    res.status(500).json({ error: "Server Error", details: error.message });
  }
};

// ✅ Add a Friend (Only Valid Users)
const addFriend = async (req, res) => {
  try {
    const { friendId } = req.body;

    // Validate Friend ID Format (Prevent CastError)
    if (!mongoose.Types.ObjectId.isValid(friendId)) {
      return res.status(400).json({
        message: "Invalid user ID format. Must be a 24-character hex string.",
      });
    }

    // Check if the friend exists
    const friend = await User.findById(friendId);
    if (!friend) {
      return res.status(404).json({ message: "User not found" });
    }

    // Prevent adding self as a friend
    if (friendId === req.user.id) {
      return res
        .status(400)
        .json({ message: "You cannot add yourself as a friend" });
    }

    // Check if already friends
    const user = await User.findById(req.user.id);
    if (user.friends.includes(friendId)) {
      return res.status(400).json({ message: "User is already your friend" });
    }

    // Add friend to user's list
    user.friends.push(friendId);
    await user.save();

    res
      .status(200)
      .json({ message: "Friend added successfully", friends: user.friends });
  } catch (error) {
    console.error("Add Friend Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Add Payment Method
const addPaymentMethod = async (req, res) => {
  try {
    const { methodType, accountDetails } = req.body;

    // Validate inputs
    if (!methodType || !accountDetails) {
      return res
        .status(400)
        .json({ message: "Payment method and account details are required" });
    }

    // Allowed payment methods
    const allowedMethods = ["UPI", "Bank Account", "PayPal", "Credit Card"];
    if (!allowedMethods.includes(methodType)) {
      return res.status(400).json({ message: "Invalid payment method" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 🔹 Check for duplicate payment method
    const existingPayment = user.paymentMethods.find(
      (payment) =>
        payment.methodType === methodType &&
        payment.accountDetails === accountDetails
    );

    if (existingPayment) {
      return res.status(400).json({
        message: "This payment method is already added.",
      });
    }

    // Add new payment method
    user.paymentMethods.push({ methodType, accountDetails });
    await user.save();

    res.status(200).json({
      message: "Payment method added successfully",
      paymentMethods: user.paymentMethods,
    });
  } catch (error) {
    console.error("Add Payment Method Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

module.exports = {
  uploadProfilePicture,
  getUserProfile,
  addFriend,
  addPaymentMethod,
};
