const mongoose = require("mongoose");
const Expense = require("../models/Expense");
const Group = require("../models/Group");
const User = require("../models/User");
const { calculateSplitDetails } = require("../utils/splitCalculator");

// Create an Expense with Full Validation
const createExpense = async (req, res) => {
  try {
    const {
      totalAmount,
      description,
      participants,
      splitMethod,
      groupId,
      splitValues,
    } = req.body;

    if (
      !totalAmount ||
      !description ||
      !participants ||
      participants.length < 2
    ) {
      return res.status(400).json({
        message:
          "Total amount, description, and at least two participants are required.",
      });
    }

    const creatorId = new mongoose.Types.ObjectId(req.user.id); // Expense creator

    // Validate and convert participants to ObjectId
    let participantsObjectIds = participants.map((id) => {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res
          .status(400)
          .json({ message: `Invalid participant ID: ${id}` });
      }
      return new mongoose.Types.ObjectId(id);
    });

    // Validate that all participants exist
    const existingUsers = await User.find({
      _id: { $in: participantsObjectIds },
    });

    if (existingUsers.length !== participantsObjectIds.length) {
      return res
        .status(400)
        .json({ message: "One or more participants do not exist." });
    }

    let groupObjectId = null;
    if (groupId) {
      if (!mongoose.Types.ObjectId.isValid(groupId)) {
        return res.status(400).json({ message: "Invalid group ID format" });
      }

      groupObjectId = new mongoose.Types.ObjectId(groupId);
      const existingGroup = await Group.findById(groupObjectId);
      if (!existingGroup) {
        return res.status(400).json({ message: "Group not found." });
      }
    }

    // ✅ **Check for Duplicate Expense Before Creation**
    const existingExpense = await Expense.findOne({
      payer: creatorId,
      totalAmount,
      description,
      splitMethod,
      participants: {
        $all: participantsObjectIds,
        $size: participantsObjectIds.length,
      },
      groupId: groupObjectId || null,
    });

    if (existingExpense) {
      return res
        .status(400)
        .json({ message: "Duplicate expense already exists." });
    }

    // Ensure splitValues are valid for Percentage & Custom methods
    if (splitMethod === "Percentage" || splitMethod === "Custom") {
      if (
        !splitValues ||
        !Array.isArray(splitValues) ||
        splitValues.length !== participantsObjectIds.length
      ) {
        return res.status(400).json({
          message: `For '${splitMethod}' split, splitValues array must be provided with valid user amounts.`,
        });
      }
    }

    // Generate split details using the function
    let splitDetails;
    try {
      splitDetails = calculateSplitDetails(
        splitMethod,
        totalAmount,
        participantsObjectIds,
        splitValues
      );
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    // Create new expense
    const newExpense = await Expense.create({
      payer: creatorId,
      totalAmount,
      description,
      participants: participantsObjectIds,
      splitMethod,
      splitValues: splitMethod === "Equal" ? [] : splitValues, // Store splitValues only for Percentage & Custom
      splitDetails,
      groupId: groupObjectId,
    });

    res
      .status(201)
      .json({ message: "Expense added successfully", expense: newExpense });
  } catch (error) {
    console.error("Error creating expense:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

module.exports = { createExpense };

// Get Expenses for a User
const getUserExpenses = async (req, res) => {
  try {
    const expenses = await Expense.find({ participants: req.user.id }).populate(
      "payer",
      "fullName"
    );
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Fetch Expenses for a Specific Group
const getGroupExpenses = async (req, res) => {
  try {
    const { groupId } = req.params;

    // Validate and convert `groupId` to ObjectId
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group ID format" });
    }

    const groupObjectId = new mongoose.Types.ObjectId(groupId);

    // Find expenses related to the specified group
    const expenses = await Expense.find({ groupId: groupObjectId }).populate(
      "participants",
      "fullName email"
    );

    if (!expenses || expenses.length === 0) {
      return res
        .status(200)
        .json({ message: "No expenses found for this group", expenses: [] });
    }

    res.json(expenses);
  } catch (error) {
    console.error("Error fetching group expenses:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

module.exports = { createExpense, getGroupExpenses, getUserExpenses };
