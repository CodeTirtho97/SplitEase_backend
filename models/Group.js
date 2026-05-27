const mongoose = require("mongoose");
const { GROUP_TYPES } = require("../utils/constants");

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    maxlength: 30,
  },
  description: {
    type: String,
    maxlength: 100,
    default: "",
  },
  type: {
    type: String,
    enum: GROUP_TYPES,
    default: "Friends",
    required: true,
  },
  completed: {
    type: Boolean,
    default: false,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  members: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  ],
}, { timestamps: true });

groupSchema.index({ members: 1 });
groupSchema.index({ createdBy: 1 });

module.exports = mongoose.model("Group", groupSchema);
