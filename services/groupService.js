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

// ✅ Create a New Group with Full Validation
const createGroup = async (req, res) => {
  try {
    const { name, description, type, members } = req.body;

    // ✅ Validate Required Fields
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

    // ✅ Fetch the creator's details
    const creator = await User.findById(creatorId);
    if (!creator) {
      return res.status(404).json({ message: "User not found." });
    }

    // ✅ Validate `type` field
    const validTypes = ["Travel", "Household", "Event", "Work", "Friends"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: "Invalid group type." });
    }

    // ✅ Get creator's friends list
    const friendsList = creator.friends.map((id) => id.toString());

    // ✅ Convert members to ObjectId and ensure creator is included
    let membersObjectIds = members.map((id) => new mongoose.Types.ObjectId(id));

    // ✅ Ensure all members are in the creator's friends list
    for (const member of members) {
      if (!friendsList.includes(member)) {
        return res.status(400).json({
          message: `User with ID ${member} is not in your friends list.`,
        });
      }
    }

    // ✅ Ensure creator is in the group
    if (!membersObjectIds.some((id) => id.equals(creatorId))) {
      membersObjectIds.push(creatorId);
    }

    // ✅ Validate Members Exist in Database
    const existingUsers = await User.find({ _id: { $in: membersObjectIds } });
    if (existingUsers.length !== membersObjectIds.length) {
      return res
        .status(400)
        .json({ message: "One or more members do not exist." });
    }

    // ✅ Prevent Duplicate Group with Same Name & Members
    const existingGroup = await Group.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
      members: { $all: membersObjectIds, $size: membersObjectIds.length },
    });

    if (existingGroup) {
      return res.status(400).json({
        message: "A group with the same name and members already exists.",
      });
    }

    // ✅ Create the Group
    const newGroup = await Group.create({
      name,
      description: description || "",
      type,
      createdBy: creatorId,
      members: membersObjectIds,
      completed: false, // Default status as active
      createdAt: Date.now(),
    });

    // ✅ Populate Created Group Response
    const populatedGroup = await Group.findById(newGroup._id)
      .populate("createdBy", "name email")
      .populate("members", "name email gender");

    res
      .status(201)
      .json({ message: "Group created successfully", group: populatedGroup });
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const getUserGroups = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id); // Ensure userId is an ObjectId

    // Fetch all groups where the user is a member
    const groups = await Group.aggregate([
      { $match: { members: userId } }, // Match groups where user is a member

      // Lookup creator details
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "creator",
        },
      },

      // Lookup member details
      {
        $lookup: {
          from: "users",
          localField: "members",
          foreignField: "_id",
          as: "memberDetails",
        },
      },

      // Lookup expenses linked to this group
      {
        $lookup: {
          from: "expenses",
          localField: "_id",
          foreignField: "groupId",
          as: "expenses",
        },
      },

      // Lookup transactions linked to this group via expenses
      {
        $lookup: {
          from: "transactions",
          localField: "expenses._id",
          foreignField: "expenseId",
          as: "transactions",
        },
      },

      // Project required fields & calculate total expenses & transactions
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

          // Extract first element from creator array & replace `createdBy`
          createdBy: { $arrayElemAt: ["$creator", 0] },

          // Send `members` as full user objects instead of ObjectIds
          members: "$memberDetails",
        },
      },
    ]);

    // Separate active and completed groups
    const totalGroups = groups.length;
    const activeGroups = groups.filter((group) => !group.completed).length;
    const completedGroups = groups.filter((group) => group.completed).length;

    res.status(200).json({
      message: "Groups fetched successfully",
      totalGroups,
      activeGroups,
      completedGroups,
      groups,
    });
  } catch (error) {
    console.error("Error fetching user groups:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ View Group Details (Group Details, Member Info, Recent 5 Transactions, Top 5 Pending Transactions)
const viewGroupDetails = async (req, res) => {
  try {
    const { groupId } = req.params;

    // 🔹 Fetch group details and populate references
    const group = await Group.findById(groupId)
      .populate("createdBy", "fullName email") // Use "fullName" for consistency
      .populate("members", "fullName email gender");

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    console.log("✅ Backend: Group Creator:", group.createdBy);

    // 🔹 Fetch expenses linked to this group
    const expenses = await Expense.find({ groupId })
      .populate("payer", "fullName email")
      .populate("participants", "fullName email");

    // ✅ Ensure expenses array exists
    if (!expenses || expenses.length === 0) {
      console.warn(`⚠️ No expenses found for group ${groupId}`);
    }

    // 🔹 Fetch recent completed transactions (limit 5)
    const completedTransactions = await Transaction.find({
      expenseId: { $in: expenses.map((e) => e._id) },
      status: "Completed", // Ensure this matches your Transaction model status
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("sender", "fullName")
      .populate("receiver", "fullName");

    // 🔹 Fetch pending transactions, sorted by highest amount
    const pendingTransactions = await Transaction.find({
      expenseId: { $in: expenses.map((e) => e._id) },
      status: "Pending",
    })
      .sort({ amount: -1 })
      .limit(5)
      .populate("sender", "fullName")
      .populate("receiver", "fullName");

    // ✅ Debug: Log transaction statuses to verify
    console.log("Completed Transactions:", completedTransactions);
    console.log("Pending Transactions:", pendingTransactions);

    // ✅ Ensure transactions arrays exist
    const safeCompletedTransactions = Array.isArray(completedTransactions)
      ? completedTransactions
      : [];
    const safePendingTransactions = Array.isArray(pendingTransactions)
      ? pendingTransactions
      : [];

    res.status(200).json({
      message: "Group details fetched successfully",
      group,
      expenses,
      completedTransactions: safeCompletedTransactions, // Recent completed transactions
      pendingTransactions: safePendingTransactions, // Top pending transactions
    });
  } catch (error) {
    console.error("❌ Error fetching group details:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Edit an Existing Group (Update Description, Completed Status, or Members)
const editGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { description, completed, members } = req.body;
    const userId = req.user.id;

    console.log("🛠️ User ID from token:", userId);
    console.log("🛠️ Group ID to edit:", groupId);

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group ID format" });
    }

    // ✅ Fetch the Group without `.lean()`
    const group = await Group.findById(groupId).populate(
      "createdBy",
      "_id fullName email"
    );

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    console.log("🛠️ Raw Group Creator:", group.createdBy);

    // ✅ Fix Permission Check
    if (group.createdBy._id.toString() !== userId.toString()) {
      return res.status(403).json({
        message: `Unauthorized: Only the creator can edit this group. [Creator ID: ${group.createdBy._id}, Requesting User ID: ${userId}]`,
      });
    }

    // ✅ Validate Members List
    if (members && Array.isArray(members)) {
      const creator = await User.findById(userId);
      if (!creator) {
        return res.status(404).json({ message: "User not found." });
      }

      const friendsList = creator.friends.map((id) => id.toString());

      for (const member of members) {
        const memberId = typeof member === "object" ? member._id : member;
        if (memberId.toString() === userId.toString()) continue; // ✅ Skip creator

        if (!friendsList.includes(memberId.toString())) {
          return res.status(400).json({
            message: `User with ID ${memberId} is not in your friends list.`,
          });
        }
      }
    }

    // ✅ Perform the update properly
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { $set: { description, completed, members } }, // ✅ Update fields only if provided
      { new: true }
    );

    res.status(200).json({
      message: "Group updated successfully",
      updatedGroup,
    });
  } catch (error) {
    console.error("❌ Error editing group:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Delete a Group (Only the Creator Can Delete)
const deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

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

    // ✅ Find all expenses related to this group
    const expenses = await Expense.find({ groupId });

    // ✅ Delete all transactions linked to these expenses
    await Transaction.deleteMany({
      expenseId: { $in: expenses.map((e) => e._id) },
    });

    // ✅ Delete all expenses for this group
    await Expense.deleteMany({ groupId });

    // ✅ Remove group from each member's list
    await User.updateMany(
      { _id: { $in: group.members } },
      { $pull: { groups: groupId } }
    );

    // ✅ Finally, delete the group
    await Group.findByIdAndDelete(groupId);

    res.status(200).json({ message: "Group deleted successfully." });
  } catch (error) {
    console.error("Error deleting group:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ✅ Fetch User's Friends List (Within Group Service)
const getUserFriends = async (req, res) => {
  try {
    //console.log("🔍 Incoming Request - User:", req.user);

    if (!req.user || !req.user._id) {
      console.error("❌ [Backend] User ID is missing!");
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const userId = req.user.id;
    //console.log("🔍 [Backend] Fetching friends for user:", userId);

    // ✅ Fetch user and populate friends
    const user = await User.findById(userId).populate(
      "friends",
      "_id fullName email"
    );

    if (!user) {
      //console.log("❌ [Backend] User not found!");
      return res.status(404).json({ message: "User not found" });
    }

    //console.log("✅ [Backend] Friends List:", user.friends);
    res.status(200).json({ friends: user.friends || [] });
  } catch (error) {
    console.error("❌ [Backend] Error fetching friends:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

/**
 * GET /api/groups/:groupId/debt-summary
 *
 * Computes the minimum number of transactions required to settle all pending
 * debts inside a group using the Minimum Cash Flow (Splitwise) algorithm.
 *
 * For a group of N members, naive pairwise settlement can require up to
 * N*(N-1) transactions. This endpoint reduces that to at most N-1 by:
 *   1. Aggregating all pending transactions into net per-person balances.
 *   2. Greedily matching the largest creditor against the largest debtor.
 *   3. Returning the optimised settlement plan alongside reduction metrics.
 */
const getGroupDebtSummary = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group ID format" });
    }

    const group = await Group.findById(groupId).populate(
      "members",
      "fullName email"
    );
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Verify caller is a member of the group
    const userId = req.user.id;
    const isMember = group.members.some((m) => m._id.toString() === userId);
    if (!isMember) {
      return res
        .status(403)
        .json({ message: "You are not a member of this group" });
    }

    // Fetch all expenses for the group, then all pending transactions for those expenses
    const groupExpenses = await Expense.find({ groupId });
    const expenseIds = groupExpenses.map((e) => e._id);

    const pendingTransactions = await Transaction.find({
      expenseId: { $in: expenseIds },
      status: "Pending",
    })
      .populate("sender", "fullName email")
      .populate("receiver", "fullName email");

    if (pendingTransactions.length === 0) {
      return res.status(200).json({
        message: "No pending debts in this group",
        group: { _id: group._id, name: group.name },
        originalTransactionCount: 0,
        optimizedTransactionCount: 0,
        reductionPercentage: 0,
        optimizedSettlements: [],
        settlementSummary: [],
      });
    }

    // Build raw debt list for the simplifier
    const rawDebts = pendingTransactions.map((t) => ({
      from: t.sender._id.toString(),
      to: t.receiver._id.toString(),
      amount: t.amount,
    }));

    const optimizedDebts = simplifyDebts(rawDebts);
    const reductionPercentage = calculateDebtReduction(
      rawDebts.length,
      optimizedDebts.length
    );

    // Build a name map for human-readable output
    const nameMap = {};
    group.members.forEach((m) => {
      nameMap[m._id.toString()] = m.fullName;
    });

    const settlementSummary = buildSettlementSummary(optimizedDebts, nameMap);

    // Attach full member details to optimized debts for frontend consumption
    const optimizedWithDetails = optimizedDebts.map((d) => ({
      from: {
        _id: d.from,
        fullName: nameMap[d.from] || "Unknown",
      },
      to: {
        _id: d.to,
        fullName: nameMap[d.to] || "Unknown",
      },
      amount: d.amount,
    }));

    res.status(200).json({
      message: "Group debt summary computed successfully",
      group: { _id: group._id, name: group.name, type: group.type },
      originalTransactionCount: rawDebts.length,
      optimizedTransactionCount: optimizedDebts.length,
      reductionPercentage,
      optimizedSettlements: optimizedWithDetails,
      settlementSummary,
    });
  } catch (error) {
    console.error("Error computing group debt summary:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
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
