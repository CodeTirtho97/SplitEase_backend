// /models/Group.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const GroupSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Group name is required"],
      trim: true,
      maxlength: [100, "Group name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Group description cannot exceed 500 characters"],
    },
    type: {
      type: String,
      enum: ["Travel", "Household", "Event", "Work", "Friends"],
      default: "Friends",
    },
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: [true, "At least one member is required"],
      },
    ],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Group creator is required"],
    },
    completed: {
      type: Boolean,
      default: false,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    isFavorite: {
      type: Boolean,
      default: false,
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
    tags: [String],
    settledMembers: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

// Make sure user is a member of the group
GroupSchema.methods.isMember = function (userId) {
  return this.members.some(
    (memberId) => memberId.toString() === userId.toString()
  );
};

// Get members excluding a specific user
GroupSchema.methods.getOtherMembers = function (userId) {
  return this.members.filter(
    (memberId) => memberId.toString() !== userId.toString()
  );
};

// Check if all members have settled up
GroupSchema.methods.isSettledUp = function () {
  const memberIds = this.members.map((member) => member.toString());
  const settledIds = this.settledMembers.map((member) => member.toString());

  return memberIds.every((id) => settledIds.includes(id));
};

// Virtual for expenses count (will be populated on demand)
GroupSchema.virtual("expensesCount");
GroupSchema.virtual("totalExpenses");
GroupSchema.virtual("pendingAmount");

// Indexes for faster queries
GroupSchema.index({ createdBy: 1 });
GroupSchema.index({ members: 1 });
GroupSchema.index({ type: 1 });
GroupSchema.index({ isArchived: 1 });
GroupSchema.index({ isFavorite: 1 });
GroupSchema.index({ lastActivity: -1 });

module.exports = mongoose.model("Group", GroupSchema);
