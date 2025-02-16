const mongoose = require("mongoose");
const Group = require("../models/Group");
const User = require("../models/User");

// Create a New Group with Validation
const createGroup = async (req, res) => {
  try {
    const { name, description, type, members } = req.body;

    if (!name || !members || members.length === 0) {
      return res
        .status(400)
        .json({ message: "Group name and at least one member are required" });
    }

    const creatorId = new mongoose.Types.ObjectId(req.user.id); // Group creator

    // Convert members array to ObjectId format
    let membersObjectIds = members.map((id) => new mongoose.Types.ObjectId(id));

    // Ensure creator is included in members list
    if (!membersObjectIds.includes(creatorId.toString())) {
      membersObjectIds.push(creatorId);
    }

    // Validate that all members exist
    const existingUsers = await User.find({ _id: { $in: membersObjectIds } });

    if (existingUsers.length !== membersObjectIds.length) {
      return res
        .status(400)
        .json({ message: "One or more members do not exist" });
    }

    // Prevent duplicate groups (same name, same exact members including creator)
    const existingGroup = await Group.findOne({
      name,
      members: { $all: membersObjectIds, $size: membersObjectIds.length },
    });

    if (existingGroup) {
      return res.status(400).json({
        message:
          "A group with the same name and members (including the creator) already exists",
      });
    }

    // Create the group only if it does not already exist
    const newGroup = await Group.create({
      name,
      description: description || "",
      type: type || "Other",
      createdBy: creatorId,
      members: membersObjectIds,
    });

    res
      .status(201)
      .json({ message: "Group created successfully", group: newGroup });
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Get All Groups the User is Part Of
const getUserGroups = async (req, res) => {
  try {
    const userId = req.user.id; // Logged-in user ID

    // Find groups where the user is a member OR the creator
    const groups = await Group.find({
      $or: [{ members: userId }, { createdBy: userId }],
    }).populate("members", "fullName email");

    // Debugging: Check if groups were found
    //console.log("Fetched Groups for User:", groups);

    if (!groups || groups.length === 0) {
      return res.status(200).json({ message: "No groups found", groups: [] });
    }

    res.json(groups);
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

module.exports = { createGroup, getUserGroups };
