const express = require("express");
const {
  createGroup,
  getUserGroups,
  deleteGroup,
  editGroup,
  viewGroupDetails,
  getUserFriends,
} = require("../services/groupService");

const protect = require("../middleware/authMiddleware");

const router = express.Router();

// ✅ Create a new group
router.post("/create", protect, createGroup);

// ✅ Route: Fetch User's Friends (via Group Module)
router.get("/friends", protect, getUserFriends);

// ✅ Fetch all groups the user is part of
router.get("/mygroups", protect, getUserGroups);

// ✅ Fetch a single group's details (for View Group modal)
router.get("/:groupId", protect, viewGroupDetails);

// ✅ Edit an existing group (update description, completed status, or members)
router.put("/edit/:groupId", protect, editGroup);

// ✅ Delete a group (with confirmation)
router.delete("/delete/:groupId", protect, deleteGroup);

module.exports = router;
