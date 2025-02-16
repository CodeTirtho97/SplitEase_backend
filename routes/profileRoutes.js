const express = require("express");
const {
  updateProfilePic,
  getUserProfile,
} = require("../services/profileService");
const protect = require("../middleware/authMiddleware"); // Import Auth Middleware
const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

// Update Profile Picture (Protected Route)
router.patch(
  "/update-pic",
  protect,
  upload.single("profilePic"),
  updateProfilePic
);

// Get User Profile (Protected Route)
router.get("/me", protect, getUserProfile);

module.exports = router;
