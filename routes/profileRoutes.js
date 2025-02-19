const express = require("express");
const {
  uploadProfilePicture,
  getUserProfile,
  addFriend,
  addPaymentMethod,
  updateProfile,
  changePassword,
  searchFriends,
  deleteFriend,
  deletePayment,
} = require("../services/profileService");
const protect = require("../middleware/authMiddleware"); // Import Auth Middleware
const upload = require("../middleware/multer");

const router = express.Router();

// Profile Picture Upload Route
router.post(
  "/upload",
  protect,
  upload.single("profilePic"),
  uploadProfilePicture
);

// Update Profile Details (Full Name & Gender)
router.put("/update", protect, updateProfile);

// Get User Profile (Protected Route)
router.get("/me", protect, getUserProfile);

// ✅ Change Password Route
router.put("/change-password", protect, changePassword);

// ✅ Add a Friend
router.post("/add-friend", protect, addFriend);

// ✅ Search Users by Name
router.post("/search-friends", protect, searchFriends);

// ✅ Add Payment Method
router.post("/add-payment", protect, addPaymentMethod);

// ✅ Delete Friend Method
router.delete("/delete-friend/:friendId", protect, deleteFriend);

// ✅ Delete Payment Method
router.delete("/delete-payment/:paymentId", protect, deletePayment);

module.exports = router;
