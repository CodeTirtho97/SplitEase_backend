const mongoose = require("mongoose");
const Group = require("../models/Group");
const Expense = require("../models/Expense");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const {
  simplifyDebts,
  calculateDebtReduction,
  buildSettlementSummary,
} = require("../utils/debtSimplifier");
const { GROUP_TYPES } = require("../utils/constants");
const { ValidationError, NotFoundError, ForbiddenError } = require("../utils/AppError");
const logger = require("../utils/logger");

const createGroup = async (creatorId, { name, description, type, members }) => {
  if (!name || !members || members.length === 0) {
    throw new ValidationError("Group name and at least one member are required.");
  }
  if (name.length > 30) {
    throw new ValidationError("Group name must be at most 30 characters long.");
  }
  if (description && description.length > 100) {
    throw new ValidationError("Group description must be at most 100 characters long.");
  }

  const creatorObjectId = new mongoose.Types.ObjectId(creatorId);
  const creator = await User.findById(creatorObjectId);
  if (!creator) {
    throw new NotFoundError("User not found.");
  }

  if (!GROUP_TYPES.includes(type)) {
    throw new ValidationError("Invalid group type.");
  }

  const friendsList = creator.friends.map((id) => id.toString());

  const membersObjectIds = members.map((id) => new mongoose.Types.ObjectId(id));

  for (const member of members) {
    if (!friendsList.includes(member)) {
      throw new ValidationError(`User with ID ${member} is not in your friends list.`);
    }
  }

  if (!membersObjectIds.some((id) => id.equals(creatorObjectId))) {
    membersObjectIds.push(creatorObjectId);
  }

  const existingUsers = await User.find({ _id: { $in: membersObjectIds } });
  if (existingUsers.length !== membersObjectIds.length) {
    throw new ValidationError("One or more members do not exist.");
  }

  const existingGroup = await Group.findOne({
    name: { $regex: new RegExp(`^${name}$`, "i") },
    members: { $all: membersObjectIds, $size: membersObjectIds.length },
  });
  if (existingGroup) {
    throw new ValidationError("A group with the same name and members already exists.");
  }

  const newGroup = await Group.create({
    name,
    description: description || "",
    type,
    createdBy: creatorObjectId,
    members: membersObjectIds,
    completed: false,
    createdAt: Date.now(),
  });

  const populatedGroup = await Group.findById(newGroup._id)
    .populate("createdBy", "name email")
    .populate("members", "name email gender");

  return { group: populatedGroup };
};

const getUserGroups = async (userId) => {
  const objectIdUserId = new mongoose.Types.ObjectId(userId);

  const groups = await Group.aggregate([
    { $match: { members: objectIdUserId } },
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
        from: "users",
        localField: "members",
        foreignField: "_id",
        as: "memberDetails",
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
        completed: 1,
        createdAt: 1,
        expenseCount: { $size: "$expenses" },
        transactionCount: { $size: "$transactions" },
        totalSpent: {
          $sum: {
            $map: {
              input: "$expenses",
              as: "expense",
              in: "$$expense.totalAmount",
            },
          },
        },
        createdBy: { $arrayElemAt: ["$creator", 0] },
        members: "$memberDetails",
      },
    },
  ]);

  const totalGroups = groups.length;
  const activeGroups = groups.filter((group) => !group.completed).length;
  const completedGroups = groups.filter((group) => group.completed).length;

  return { totalGroups, activeGroups, completedGroups, groups };
};

const viewGroupDetails = async (groupId) => {
  const group = await Group.findById(groupId)
    .populate("createdBy", "fullName email")
    .populate("members", "fullName email gender");

  if (!group) {
    throw new NotFoundError("Group not found.");
  }

  logger.debug(`Group creator: ${group.createdBy}`);

  const expenses = await Expense.find({ groupId })
    .populate("payer", "fullName email")
    .populate("participants", "fullName email");

  if (!expenses || expenses.length === 0) {
    logger.debug(`No expenses found for group ${groupId}`);
  }

  const completedTransactions = await Transaction.find({
    expenseId: { $in: expenses.map((e) => e._id) },
    status: "Success",
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate("sender", "fullName")
    .populate("receiver", "fullName");

  const pendingTransactions = await Transaction.find({
    expenseId: { $in: expenses.map((e) => e._id) },
    status: "Pending",
  })
    .sort({ amount: -1 })
    .limit(5)
    .populate("sender", "fullName")
    .populate("receiver", "fullName");

  logger.debug(
    `Group ${groupId}: ${completedTransactions.length} completed, ${pendingTransactions.length} pending transactions`
  );

  return {
    group,
    expenses,
    completedTransactions: Array.isArray(completedTransactions) ? completedTransactions : [],
    pendingTransactions: Array.isArray(pendingTransactions) ? pendingTransactions : [],
  };
};

const editGroup = async (groupId, userId, { description, completed, members } = {}) => {
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    throw new ValidationError("Invalid group ID format");
  }

  logger.debug(`editGroup: userId=${userId} groupId=${groupId}`);

  const group = await Group.findById(groupId).populate("createdBy", "_id fullName email");
  if (!group) {
    throw new NotFoundError("Group not found.");
  }

  logger.debug(`editGroup creator: ${group.createdBy._id}`);

  if (group.createdBy._id.toString() !== userId.toString()) {
    throw new ForbiddenError(
      `Unauthorized: Only the creator can edit this group. [Creator ID: ${group.createdBy._id}, Requesting User ID: ${userId}]`
    );
  }

  if (members && Array.isArray(members)) {
    const creator = await User.findById(userId);
    if (!creator) {
      throw new NotFoundError("User not found.");
    }

    const friendsList = creator.friends.map((id) => id.toString());

    for (const member of members) {
      const memberId = typeof member === "object" ? member._id : member;
      if (memberId.toString() === userId.toString()) continue;
      if (!friendsList.includes(memberId.toString())) {
        throw new ValidationError(`User with ID ${memberId} is not in your friends list.`);
      }
    }
  }

  const updateFields = {};
  if (description !== undefined) updateFields.description = description;
  if (completed !== undefined) updateFields.completed = completed;
  if (members !== undefined) updateFields.members = members;

  const updatedGroup = await Group.findByIdAndUpdate(
    groupId,
    { $set: updateFields },
    { new: true }
  );

  return { updatedGroup };
};

const deleteGroup = async (groupId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    throw new ValidationError("Invalid group ID format");
  }

  const group = await Group.findById(groupId);
  if (!group) {
    throw new NotFoundError("Group not found.");
  }

  if (group.createdBy.toString() !== userId) {
    throw new ForbiddenError("Unauthorized: Only the creator can delete this group.");
  }

  const expenses = await Expense.find({ groupId });

  await Transaction.deleteMany({ expenseId: { $in: expenses.map((e) => e._id) } });
  await Expense.deleteMany({ groupId });
  await User.updateMany({ _id: { $in: group.members } }, { $pull: { groups: groupId } });
  await Group.findByIdAndDelete(groupId);
};

const getUserFriends = async (userId) => {
  const user = await User.findById(userId).populate("friends", "_id fullName email");
  if (!user) {
    throw new NotFoundError("User not found");
  }
  return { friends: user.friends || [] };
};

const getGroupDebtSummary = async (groupId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    throw new ValidationError("Invalid group ID format");
  }

  const group = await Group.findById(groupId).populate("members", "fullName email");
  if (!group) {
    throw new NotFoundError("Group not found");
  }

  const isMember = group.members.some((m) => m._id.toString() === userId);
  if (!isMember) {
    throw new ForbiddenError("You are not a member of this group");
  }

  const groupExpenses = await Expense.find({ groupId });
  const expenseIds = groupExpenses.map((e) => e._id);

  const pendingTransactions = await Transaction.find({
    expenseId: { $in: expenseIds },
    status: "Pending",
  })
    .populate("sender", "fullName email")
    .populate("receiver", "fullName email");

  if (pendingTransactions.length === 0) {
    return {
      group: { _id: group._id, name: group.name },
      originalTransactionCount: 0,
      optimizedTransactionCount: 0,
      reductionPercentage: 0,
      optimizedSettlements: [],
      settlementSummary: [],
    };
  }

  const rawDebts = pendingTransactions.map((t) => ({
    from: t.sender._id.toString(),
    to: t.receiver._id.toString(),
    amount: t.amount,
  }));

  const optimizedDebts = simplifyDebts(rawDebts);
  const reductionPercentage = calculateDebtReduction(rawDebts.length, optimizedDebts.length);

  const nameMap = {};
  group.members.forEach((m) => {
    nameMap[m._id.toString()] = m.fullName;
  });

  const settlementSummary = buildSettlementSummary(optimizedDebts, nameMap);

  const optimizedWithDetails = optimizedDebts.map((d) => ({
    from: { _id: d.from, fullName: nameMap[d.from] || "Unknown" },
    to: { _id: d.to, fullName: nameMap[d.to] || "Unknown" },
    amount: d.amount,
  }));

  return {
    group: { _id: group._id, name: group.name, type: group.type },
    originalTransactionCount: rawDebts.length,
    optimizedTransactionCount: optimizedDebts.length,
    reductionPercentage,
    optimizedSettlements: optimizedWithDetails,
    settlementSummary,
  };
};

module.exports = {
  createGroup,
  getUserGroups,
  viewGroupDetails,
  editGroup,
  deleteGroup,
  getUserFriends,
  getGroupDebtSummary,
};
