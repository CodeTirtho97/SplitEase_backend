const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const cloudinary = require("../config/cloudinary");

// Upload or Update Profile Picture
const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded!" });
    }

    const allowedFormats = ["image/jpeg", "image/jpg", "image/png"];
    const maxSize = 100 * 1024; // 100KB

    // ✅ Validate File Format
    if (!allowedFormats.includes(req.file.mimetype)) {
      return res
        .status(400)
        .json({ message: "Invalid format! Use JPG, JPEG, PNG." });
    }

    // ✅ Validate File Size
    if (req.file.size > maxSize) {
      return res
        .status(400)
        .json({ message: "File too large! Max size: 100KB." });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Delete old profile picture if exists
    if (user.profilePic && user.profilePic.includes("cloudinary")) {
      const publicId = user.profilePic.split("/").pop().split(".")[0]; // Extract public ID
      await cloudinary.uploader.destroy(`profile_pics/${publicId}`);
    }

    // ✅ Save new profile pic
    user.profilePic = req.file.path;
    await user.save();

    res.status(200).json({
      message: "Profile picture updated successfully",
      profilePic: user.profilePic,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Update Profile (Full Name & Gender)
const updateProfile = async (req, res) => {
  try {
    const { fullName, gender } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // ✅ Ensure only allowed fields are updated
    if (req.body.fullName) user.fullName = req.body.fullName;
    if (req.body.gender) user.gender = req.body.gender;
    if (req.body.profilePic) user.profilePic = req.body.profilePic;

    await user.save();
    //console.log("Updated Profile Successfully:", user);

    res.status(200).json({
      message: "Profile updated successfully",
      fullName: user.fullName,
      gender: user.gender,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Fetch User Profile (Including Profile Pic)
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password")
      .populate("friends", "fullName email profilePic"); // Make sure to include necessary fields

    if (!user) return res.status(404).json({ message: "User not found" });

    // Log to verify population worked
    console.log("Populated friends:", user.friends);

    res.json({
      fullName: user.fullName,
      email: user.email,
      gender: user.gender || "male",
      profilePic: user.profilePic || "",
      friends: user.friends,
      paymentMethods: user.paymentMethods,
      googleId: user.googleId || null, // Explicitly include googleId, default to null if not present
    });
  } catch (error) {
    res.status(500).json({ error: "Server Error", details: error.message });
  }
};

// ✅ Change Password Function
const changePassword = async (req, res) => {
  try {
    //console.log("🔹 Received Change Password Request:", req.body);
    const { oldPassword, newPassword, confirmNewPassword } = req.body;

    if (!oldPassword || !newPassword || !confirmNewPassword) {
      //console.log("❌ Missing Fields in Request");
      return res.status(400).json({ message: "All fields are required" });
    }
    if (newPassword !== confirmNewPassword) {
      //console.log("❌ New Passwords Do Not Match");
      return res.status(400).json({ message: "New passwords do not match" });
    }
    if (newPassword.length < 8) {
      //console.log("❌ Password Too Short");
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long" });
    }

    // Find user
    const user = await User.findById(req.user.id);
    if (!user) {
      //console.log("❌ User Not Found");
      return res.status(404).json({ message: "User not found" });
    }

    // Verify old password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      //console.log("❌ Incorrect Old Password");
      return res.status(400).json({ message: "Incorrect old password" });
    }

    // Check if new password is same as old one
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      //console.log("❌ Cannot Use Previous Password");
      return res.status(400).json({
        message: "Choose a different password than the previous one!",
      });
    }

    // ✅ Hash new password properly
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    await user.save();
    //console.log("✅ Password Updated Successfully!");
    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Change Password Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Fix Friend Search API
const searchFriends = async (req, res) => {
  try {
    const { friendName } = req.body;

    // Input validation
    if (!friendName || friendName.trim().length === 0) {
      return res.status(400).json({ message: "Friend name is required" });
    }

    const user = await User.findById(req.user.id).select("friends");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Improve search with more flexible regex
    const friends = await User.find({
      $or: [
        { fullName: { $regex: new RegExp(friendName, "i") } }, // Case-insensitive name search
        { email: { $regex: new RegExp(friendName, "i") } }, // Also search by email
      ],
      _id: { $ne: req.user.id }, // Exclude self
    }).select("_id fullName email profilePic");

    // Better logging to diagnose issues
    console.log(
      `Friend search for "${friendName}" found ${friends.length} results`
    );

    if (friends.length === 0) {
      return res.status(404).json({ message: "No users found with this name" });
    }

    // Filter out already added friends
    const userFriendIds = user.friends.map((id) => id.toString());
    const availableFriends = friends.filter(
      (friend) => !userFriendIds.includes(friend._id.toString())
    );

    console.log(
      `After filtering existing friends, ${availableFriends.length} results remain`
    );

    if (availableFriends.length === 0) {
      return res
        .status(400)
        .json({ message: "No new friends available to add" });
    }

    res
      .status(200)
      .json({ message: "Matching friends found", friends: availableFriends });
  } catch (error) {
    console.error("Friend Search Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Add a Friend (Only Valid Users)
const addFriend = async (req, res) => {
  try {
    const { friendId } = req.body;

    if (!friendId) {
      return res.status(400).json({ message: "Friend ID is required" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const friend = await User.findById(friendId);
    if (!friend) {
      return res.status(404).json({ message: "Friend not found" });
    }

    // ✅ Check if already added
    if (user.friends.includes(friendId)) {
      return res.status(400).json({ message: "Friend already added!" });
    }

    // ✅ Add Friend & Save
    user.friends.push(friendId);
    await user.save();

    res.status(200).json({ message: "Friend added successfully!", friendId });
  } catch (error) {
    //console.error("Add Friend Error:", error);
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
    const allowedMethods = ["UPI", "PayPal", "Stripe"];
    if (!allowedMethods.includes(methodType)) {
      return res.status(400).json({ message: "Invalid payment method" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check for duplicate payment method
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

    // Return the complete user object to ensure the frontend has the latest data
    // This helps prevent issues where the frontend loses user data after updates
    const userResponse = {
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      gender: user.gender || "Other",
      googleId: user.googleId,
      profilePic: user.profilePic || "",
      friends: user.friends,
      paymentMethods: user.paymentMethods,
    };

    res.status(200).json(userResponse);
  } catch (error) {
    console.error("Add Payment Method Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const deleteFriend = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Remove friend ID from the array
    user.friends = user.friends.filter(
      (friend) => friend.toString() !== req.params.friendId
    );
    await user.save();

    res.json({ message: "Friend removed successfully", friends: user.friends });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const deletePayment = async (req, res) => {
  try {
    const { paymentId } = req.params; // Get payment ID from URL params

    // Input validation
    if (!paymentId) {
      return res.status(400).json({ message: "Payment ID is required" });
    }

    // Log for debugging
    console.log(`Attempting to delete payment with ID: ${paymentId}`);

    // Find the user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if payment exists
    const paymentExists = user.paymentMethods.some(
      (payment) => payment._id.toString() === paymentId
    );

    if (!paymentExists) {
      return res.status(404).json({ message: "Payment method not found" });
    }

    // Remove the payment using MongoDB's pull operator
    user.paymentMethods = user.paymentMethods.filter(
      (payment) => payment._id.toString() !== paymentId
    );

    await user.save();

    console.log(`Successfully removed payment method ${paymentId}`);

    res.status(200).json({
      message: "Payment method removed successfully",
      paymentMethods: user.paymentMethods,
    });
  } catch (error) {
    console.error("Delete Payment Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

module.exports = {
  uploadProfilePicture,
  getUserProfile,
  changePassword,
  searchFriends,
  addFriend,
  addPaymentMethod,
  updateProfile,
  deleteFriend,
  deletePayment,
};
