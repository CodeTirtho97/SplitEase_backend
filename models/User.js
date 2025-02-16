const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const PaymentMethodSchema = new mongoose.Schema({
  type: { type: String, required: true, enum: ["UPI", "PayPal", "Stripe"] },
  details: { type: String, required: true },
});

const UserSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
      required: function () {
        return !this.googleId;
      },
    },
    password: { type: String },
    googleId: { type: String },
    profilePic: {
      type: String,
      default: "",
    },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    paymentMethods: [PaymentMethodSchema],
    groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }],
  },
  { timestamps: true }
);

// Hash password before saving
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password for login
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", UserSchema);
module.exports = User;
