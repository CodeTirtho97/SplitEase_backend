// /services/groupService.js
const Group = require("../models/Group");
const Expense = require("../models/Expense");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const mongoose = require("mongoose");
const {
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
} = require("../utils/errors");

// Create a new group
exports.createGroup = async (groupData, userId) => {
  try {
    // Validate that at least one member is included
    if (!groupData.members || groupData.members.length === 0) {
      throw new BadRequestError("At least one member is required for a group");
    }

    // Create a new group
    const group = new Group({
      ...groupData,
      members: [...new Set([...groupData.members, userId])], // Ensure creator is included as a member
      createdBy: userId,
      lastActivity: Date.now(),
    });

    await group.save();

    // Populate user data for response
    await group.populate([
      { path: "members", select: "fullName email avatar" },
      { path: "createdBy", select: "fullName email avatar" },
    ]);

    return group;
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      throw new BadRequestError(error.message);
    }
    throw error;
  }
};

// Get all groups for a user
exports.getAllGroups = async (userId) => {
  try {
    // Find groups where the user is a member and not archived
    const groups = await Group.find({
      members: userId,
      isArchived: false,
    })
      .sort({ lastActivity: -1 })
      .populate("members", "fullName email avatar")
      .populate("createdBy", "fullName email avatar");

    // For each group, get expenses count and total
    for (const group of groups) {
      const expensesAggregation = await Expense.aggregate([
        { $match: { group: group._id } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            total: { $sum: "$amount" },
          },
        },
      ]);

      // If expenses exist, set the virtual properties
      if (expensesAggregation.length > 0) {
        group.expensesCount = expensesAggregation[0].count;
        group.totalExpenses = expensesAggregation[0].total;
      } else {
        group.expensesCount = 0;
        group.totalExpenses = 0;
      }

      // Get pending amount calculation
      const pendingAmount = await this.calculatePendingAmount(group._id);
      group.pendingAmount = pendingAmount;
    }

    return groups;
  } catch (error) {
    throw error;
  }
};

// Get a specific group by ID
exports.getGroupById = async (groupId, userId) => {
  try {
    const group = await Group.findById(groupId)
      .populate("members", "fullName email avatar")
      .populate("createdBy", "fullName email avatar")
      .populate("settledMembers", "fullName email avatar");

    if (!group) {
      throw new NotFoundError("Group not found");
    }

    // Verify the user is a member of the group
    if (!group.members.some((member) => member._id.toString() === userId)) {
      throw new UnauthorizedError("You are not a member of this group");
    }

    // Get expenses count and total
    const expensesAggregation = await Expense.aggregate([
      { $match: { group: mongoose.Types.ObjectId(groupId) } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          total: { $sum: "$amount" },
        },
      },
    ]);

    // Set virtual properties
    if (expensesAggregation.length > 0) {
      group.expensesCount = expensesAggregation[0].count;
      group.totalExpenses = expensesAggregation[0].total;
    } else {
      group.expensesCount = 0;
      group.totalExpenses = 0;
    }

    // Calculate pending amount
    group.pendingAmount = await this.calculatePendingAmount(groupId);

    // Update lastActivity timestamp
    await Group.findByIdAndUpdate(groupId, { lastActivity: Date.now() });

    return group;
  } catch (error) {
    throw error;
  }
};

// Update a group
exports.updateGroup = async (groupId, updateData, userId) => {
  try {
    const group = await Group.findById(groupId);

    if (!group) {
      throw new NotFoundError("Group not found");
    }

    // Verify the user is the creator of the group
    if (group.createdBy.toString() !== userId) {
      throw new UnauthorizedError(
        "Only the group creator can update the group"
      );
    }

    // Make sure creator remains a member
    if (updateData.members && Array.isArray(updateData.members)) {
      if (!updateData.members.includes(userId.toString())) {
        updateData.members.push(userId);
      }
    }

    // Update the group and set lastActivity timestamp
    updateData.lastActivity = Date.now();

    const updatedGroup = await Group.findByIdAndUpdate(groupId, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("members", "fullName email avatar")
      .populate("createdBy", "fullName email avatar");

    return updatedGroup;
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      throw new BadRequestError(error.message);
    }
    throw error;
  }
};

// Delete a group
exports.deleteGroup = async (groupId, userId) => {
  try {
    const group = await Group.findById(groupId);

    if (!group) {
      throw new NotFoundError("Group not found");
    }

    // Verify the user is the creator of the group
    if (group.createdBy.toString() !== userId) {
      throw new UnauthorizedError(
        "Only the group creator can delete the group"
      );
    }

    // Check if there are any unresolved expenses
    const pendingExpenses = await Expense.countDocuments({
      group: groupId,
      isSettled: false,
    });

    if (pendingExpenses > 0) {
      throw new BadRequestError("Cannot delete group with unresolved expenses");
    }

    // Delete related expenses
    await Expense.deleteMany({ group: groupId });

    // Delete related transactions
    await Transaction.deleteMany({ group: groupId });

    // Delete the group
    await Group.findByIdAndDelete(groupId);

    return { message: "Group and related data deleted successfully" };
  } catch (error) {
    throw error;
  }
};

// Archive a group (soft delete)
exports.archiveGroup = async (groupId, userId) => {
  try {
    const group = await Group.findById(groupId);

    if (!group) {
      throw new NotFoundError("Group not found");
    }

    // Verify the user is the creator of the group
    if (group.createdBy.toString() !== userId) {
      throw new UnauthorizedError(
        "Only the group creator can archive the group"
      );
    }

    // Mark the group as archived
    const archivedGroup = await Group.findByIdAndUpdate(
      groupId,
      { isArchived: true },
      { new: true }
    )
      .populate("members", "fullName email avatar")
      .populate("createdBy", "fullName email avatar");

    return archivedGroup;
  } catch (error) {
    throw error;
  }
};

// Toggle group favorite status
exports.toggleFavorite = async (groupId, userId) => {
  try {
    const group = await Group.findById(groupId);

    if (!group) {
      throw new NotFoundError("Group not found");
    }

    // Verify the user is a member of the group
    if (!group.members.includes(userId)) {
      throw new UnauthorizedError("You are not a member of this group");
    }

    // Toggle the favorite status
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { isFavorite: !group.isFavorite },
      { new: true }
    )
      .populate("members", "fullName email avatar")
      .populate("createdBy", "fullName email avatar");

    return updatedGroup;
  } catch (error) {
    throw error;
  }
};

// Get multiple groups by IDs
exports.getGroupsByIds = async (groupIds, userId) => {
  try {
    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      throw new BadRequestError("Valid group IDs array is required");
    }

    const groups = await Group.find({
      _id: { $in: groupIds },
      members: userId,
      isArchived: false,
    })
      .populate("members", "fullName email avatar")
      .populate("createdBy", "fullName email avatar");

    return groups;
  } catch (error) {
    throw error;
  }
};

// Get group statistics
exports.getGroupStats = async (groupId, userId) => {
  try {
    const group = await Group.findById(groupId);

    if (!group) {
      throw new NotFoundError("Group not found");
    }

    // Verify the user is a member of the group
    if (!group.members.includes(userId)) {
      throw new UnauthorizedError("You are not a member of this group");
    }

    // Get total expenses in the group
    const expensesAggregation = await Expense.aggregate([
      { $match: { group: mongoose.Types.ObjectId(groupId) } },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Get settled and pending amounts
    const settledExpenses = await Expense.aggregate([
      {
        $match: {
          group: mongoose.Types.ObjectId(groupId),
          isSettled: true,
        },
      },
      {
        $group: {
          _id: null,
          settledAmount: { $sum: "$amount" },
        },
      },
    ]);

    // Get member contributions
    const memberContributions = await Expense.aggregate([
      { $match: { group: mongoose.Types.ObjectId(groupId) } },
      {
        $group: {
          _id: "$paidBy",
          amount: { $sum: "$amount" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      {
        $project: {
          memberId: "$_id",
          memberName: { $arrayElemAt: ["$userDetails.fullName", 0] },
          amount: 1,
        },
      },
    ]);

    // Calculate total amount and percentage for each member
    const totalAmount =
      expensesAggregation.length > 0 ? expensesAggregation[0].totalAmount : 0;

    const memberStats = memberContributions.map((member) => ({
      memberId: member.memberId,
      memberName: member.memberName,
      amount: member.amount,
      percentage:
        totalAmount > 0 ? ((member.amount / totalAmount) * 100).toFixed(2) : 0,
    }));

    return {
      totalExpenses:
        expensesAggregation.length > 0 ? expensesAggregation[0].count : 0,
      totalAmount: totalAmount,
      settledAmount:
        settledExpenses.length > 0 ? settledExpenses[0].settledAmount : 0,
      pendingAmount:
        totalAmount -
        (settledExpenses.length > 0 ? settledExpenses[0].settledAmount : 0),
      memberContributions: memberStats,
    };
  } catch (error) {
    throw error;
  }
};

// Get group transactions
exports.getGroupTransactions = async (groupId, userId) => {
  try {
    const group = await Group.findById(groupId);

    if (!group) {
      throw new NotFoundError("Group not found");
    }

    // Verify the user is a member of the group
    if (!group.members.includes(userId)) {
      throw new UnauthorizedError("You are not a member of this group");
    }

    // Get all transactions for the group
    const transactions = await Transaction.find({ group: groupId })
      .populate("sender", "fullName email avatar")
      .populate("receiver", "fullName email avatar")
      .sort({ createdAt: -1 });

    // Separate completed and pending transactions
    const completed = transactions.filter((txn) => txn.status === "completed");
    const pending = transactions.filter((txn) => txn.status === "pending");

    return { completed, pending };
  } catch (error) {
    throw error;
  }
};

// Calculate who owes whom
exports.calculateOwes = async (groupId, userId) => {
  try {
    const group = await Group.findById(groupId);

    if (!group) {
      throw new NotFoundError("Group not found");
    }

    // Verify the user is a member of the group
    if (!group.members.includes(userId)) {
      throw new UnauthorizedError("You are not a member of this group");
    }

    // Get all expenses in the group
    const expenses = await Expense.find({
      group: groupId,
      isSettled: false,
    })
      .populate("paidBy", "fullName")
      .populate("splitAmong", "fullName");

    // Calculate balances
    const balances = new Map();

    // Process each expense
    for (const expense of expenses) {
      const payer = expense.paidBy.fullName;
      const splitAmount = expense.amount / expense.splitAmong.length;

      // For each person the expense is split among
      for (const person of expense.splitAmong) {
        const participant = person.fullName;

        // Skip if payer and participant are the same
        if (payer === participant) continue;

        // Initialize balances if needed
        if (!balances.has(payer)) balances.set(payer, new Map());
        if (!balances.has(participant)) balances.set(participant, new Map());

        // Update how much participant owes payer
        const payerMap = balances.get(payer);
        const participantMap = balances.get(participant);

        const currentOwed = payerMap.get(participant) || 0;
        payerMap.set(participant, currentOwed + splitAmount);

        // Update how much payer is owed by participant (negative direction)
        const currentOwing = participantMap.get(payer) || 0;
        participantMap.set(payer, currentOwing - splitAmount);
      }
    }

    // Simplify and convert to array format
    const owes = [];
    for (const [from, toMap] of balances.entries()) {
      for (const [to, amount] of toMap.entries()) {
        if (amount > 0) {
          owes.push({
            from,
            to,
            amount: parseFloat(amount.toFixed(2)),
          });
        }
      }
    }

    return owes;
  } catch (error) {
    throw error;
  }
};

// Helper method to calculate pending amount for a group
exports.calculatePendingAmount = async (groupId) => {
  try {
    // Get total expenses amount
    const totalExpenses = await Expense.aggregate([
      { $match: { group: mongoose.Types.ObjectId(groupId) } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // Get settled expenses amount
    const settledExpenses = await Expense.aggregate([
      {
        $match: {
          group: mongoose.Types.ObjectId(groupId),
          isSettled: true,
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const totalAmount = totalExpenses.length > 0 ? totalExpenses[0].total : 0;
    const settledAmount =
      settledExpenses.length > 0 ? settledExpenses[0].total : 0;

    return totalAmount - settledAmount;
  } catch (error) {
    throw error;
  }
};
