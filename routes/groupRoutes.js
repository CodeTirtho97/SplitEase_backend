const express = require("express");
const { createGroup, getUserGroups } = require("../services/groupService");
const protect = require("../middleware/authMiddleware"); // Ensure only logged-in users can access

const router = express.Router();

// Route to create a new group
router.post("/create", protect, createGroup);

// Route to get all groups a user is part of
router.get("/my-groups", protect, getUserGroups);

module.exports = router;
