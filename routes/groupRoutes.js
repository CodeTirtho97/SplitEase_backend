const express = require("express");
const {
  createGroup,
  getUserGroups,
  deleteGroup, // Ensure this exists in `groupService.js`
} = require("../services/groupService");

const protect = require("../middleware/authMiddleware");

const router = express.Router();

// Create a new group
router.post("/create", protect, createGroup);

// Fetch user's groups
router.get("/mygroups", protect, getUserGroups);

// Delete a group
router.delete("/delete/:groupId", protect, deleteGroup);

module.exports = router;
