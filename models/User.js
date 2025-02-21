const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, maxlength: 30 },
    email: { type: String, required: true, unique: true },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
      required: function () {
        return !this.googleId;
      },
    },
    password: { type: String },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    googleId: { type: String },
    profilePic: {
      type: String,
      default: "",
    },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    paymentMethods: [
      {
        methodType: { type: String, required: true },
        accountDetails: { type: String, required: true },
      },
    ],
    //groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }],
  },
  { timestamps: true }
);

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();

  // Check if password is already hashed
  const passwordIsHashed =
    this.password.startsWith("$2a$") || this.password.startsWith("$2b$");

  if (!passwordIsHashed) {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  }

  next();
});

// Compare password for login
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", UserSchema);
module.exports = User;
