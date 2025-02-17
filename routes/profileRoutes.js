const express = require("express");
const {
  uploadProfilePicture,
  getUserProfile,
  addFriend,
  addPaymentMethod,
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

// Get User Profile (Protected Route)
router.get("/me", protect, getUserProfile);

// ✅ Add a Friend
router.post("/add-friend", protect, addFriend);

// ✅ Add Payment Method
router.post("/add-payment", protect, addPaymentMethod);

module.exports = router;
