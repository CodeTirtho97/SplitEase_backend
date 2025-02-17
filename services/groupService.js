const mongoose = require("mongoose");
const Group = require("../models/Group");
const Expense = require("../models/Expense");
const Transaction = require("../models/Transaction");
const User = require("../models/User");

// ✅ Create a New Group with Full Validation
const createGroup = async (req, res) => {
  try {
    const { name, description, type, members } = req.body;

    if (!name || !members || members.length === 0) {
      return res
        .status(400)
        .json({ message: "Group name and at least one member are required." });
    }

    if (name.length > 30) {
      return res
        .status(400)
        .json({ message: "Group name must be at most 30 characters long." });
    }

    if (description && description.length > 100) {
      return res.status(400).json({
        message: "Group description must be at most 100 characters long.",
      });
    }

    const creatorId = new mongoose.Types.ObjectId(req.user.id);

    // ✅ Fetch the creator's details from the User model
    const creator = await User.findById(creatorId);
    if (!creator) {
      return res.status(404).json({ message: "User not found." });
    }

    const friendsList = creator.friends.map((id) => id.toString()); // Convert ObjectId to string

    // Convert members to ObjectId and ensure creator is included
    let membersObjectIds = members.map((id) => new mongoose.Types.ObjectId(id));

    // ✅ Ensure that all members are in the creator's friends list
    for (const member of members) {
      if (!friendsList.includes(member)) {
        return res.status(400).json({
          message: `User with ID ${member} is not in your friends list.`,
        });
      }
    }

    // Ensure creator is in the group
    if (!membersObjectIds.some((id) => id.equals(creatorId))) {
      membersObjectIds.push(creatorId);
    }

    // Validate members
    const existingUsers = await User.find({ _id: { $in: membersObjectIds } });

    if (existingUsers.length !== membersObjectIds.length) {
      return res
        .status(400)
        .json({ message: "One or more members do not exist." });
    }

    // Prevent duplicate groups with same name & members
    const existingGroup = await Group.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
      members: { $all: membersObjectIds, $size: membersObjectIds.length },
    });

    if (existingGroup) {
      return res.status(400).json({
        message: "A group with the same name and members already exists.",
      });
    }

    // ✅ Create the group
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

// ✅ Get All Groups the User is Part Of (with expense & transaction count)
const getUserGroups = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch groups along with total expenses & transactions count
    const groups = await Group.aggregate([
      { $match: { members: new mongoose.Types.ObjectId(userId) } },
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "creator",
        },
      },
      {
        $lookup: {
          from: "expenses",
          localField: "_id",
          foreignField: "groupId",
          as: "expenses",
        },
      },
      {
        $lookup: {
          from: "transactions",
          localField: "expenses._id",
          foreignField: "expenseId",
          as: "transactions",
        },
      },
      {
        $project: {
          name: 1,
          description: 1,
          type: 1,
          createdBy: 1,
          members: 1,
          expenseCount: { $size: "$expenses" },
          transactionCount: { $size: "$transactions" },
          creator: { $arrayElemAt: ["$creator", 0] }, // Get creator details
        },
      },
    ]);

    groups.forEach((group) => {
      group._id = group._id.toString();
    });

    res.status(200).json({ message: "Groups fetched successfully", groups });
  } catch (error) {
    console.error("Error fetching user groups:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Delete a Group (Only the Creator Can Delete)
const deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id; // Authenticated user ID

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group ID format" });
    }

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    // ✅ Ensure only the creator can delete
    if (group.createdBy.toString() !== userId) {
      return res.status(403).json({
        message: "Unauthorized: Only the creator can delete this group.",
      });
    }

    // ✅ Cascade delete all related expenses and transactions
    await Expense.deleteMany({ groupId });
    await Transaction.deleteMany({ expenseId: { $in: group.expenses } });

    // ✅ Finally, delete the group
    await Group.findByIdAndDelete(groupId);

    res.status(200).json({ message: "Group deleted successfully." });
  } catch (error) {
    console.error("Error deleting group:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

module.exports = { createGroup, getUserGroups, deleteGroup };
