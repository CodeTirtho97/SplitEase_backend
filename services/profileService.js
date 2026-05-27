const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const cloudinary = require("../config/cloudinary");
const { PAYMENT_MODES } = require("../utils/constants");
const { ValidationError, NotFoundError } = require("../utils/AppError");
const logger = require("../utils/logger");

const uploadProfilePicture = async (userId, file) => {
  if (!file) {
    throw new ValidationError("No file uploaded!");
  }

  const allowedFormats = ["image/jpeg", "image/jpg", "image/png"];
  const maxSize = 100 * 1024;

  if (!allowedFormats.includes(file.mimetype)) {
    throw new ValidationError("Invalid format! Use JPG, JPEG, PNG.");
  }
  if (file.size > maxSize) {
    throw new ValidationError("File too large! Max size: 100KB.");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (user.profilePic && user.profilePic.includes("cloudinary")) {
    const publicId = user.profilePic.split("/").pop().split(".")[0];
    await cloudinary.uploader.destroy(`profile_pics/${publicId}`);
  }

  user.profilePic = file.path;
  await user.save();

  return { profilePic: user.profilePic };
};

const updateProfile = async (userId, { fullName, gender, profilePic } = {}) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (fullName) user.fullName = fullName;
  if (gender) user.gender = gender;
  if (profilePic) user.profilePic = profilePic;

  await user.save();

  return { fullName: user.fullName, gender: user.gender };
};

const getUserProfile = async (userId) => {
  const user = await User.findById(userId)
    .select("-password")
    .populate("friends", "fullName email profilePic");

  if (!user) {
    throw new NotFoundError("User not found");
  }

  return {
    fullName: user.fullName,
    email: user.email,
    gender: user.gender || "male",
    profilePic: user.profilePic || "",
    friends: user.friends,
    paymentMethods: user.paymentMethods,
    googleId: user.googleId || null,
  };
};

const changePassword = async (userId, { oldPassword, newPassword, confirmNewPassword }) => {
  if (!oldPassword || !newPassword || !confirmNewPassword) {
    throw new ValidationError("All fields are required");
  }
  if (newPassword !== confirmNewPassword) {
    throw new ValidationError("New passwords do not match");
  }
  if (newPassword.length < 8) {
    throw new ValidationError("Password must be at least 8 characters long");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) {
    throw new ValidationError("Incorrect old password");
  }

  const isSamePassword = await bcrypt.compare(newPassword, user.password);
  if (isSamePassword) {
    throw new ValidationError("Choose a different password than the previous one!");
  }

  const salt = await bcrypt.genSalt(12);
  user.password = await bcrypt.hash(newPassword, salt);
  await user.save();
};

const searchFriends = async (userId, friendName) => {
  if (!friendName || friendName.trim().length === 0) {
    throw new ValidationError("Friend name is required");
  }

  const user = await User.findById(userId).select("friends");
  if (!user) {
    throw new NotFoundError("User not found");
  }

  const friends = await User.find({
    $or: [
      { fullName: { $regex: new RegExp(friendName, "i") } },
      { email: { $regex: new RegExp(friendName, "i") } },
    ],
    _id: { $ne: userId },
  }).select("_id fullName email profilePic");

  logger.debug(`Friend search for "${friendName}" found ${friends.length} results`);

  if (friends.length === 0) {
    throw new NotFoundError("No users found with this name");
  }

  const userFriendIds = user.friends.map((id) => id.toString());
  const availableFriends = friends.filter(
    (friend) => !userFriendIds.includes(friend._id.toString())
  );

  logger.debug(`After filtering existing friends, ${availableFriends.length} results remain`);

  if (availableFriends.length === 0) {
    throw new ValidationError("No new friends available to add");
  }

  return { friends: availableFriends };
};

const addFriend = async (userId, friendId) => {
  if (!friendId) {
    throw new ValidationError("Friend ID is required");
  }
  if (!mongoose.Types.ObjectId.isValid(friendId)) {
    throw new ValidationError("Invalid user ID format. Must be a 24-character hex string.");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  const friend = await User.findById(friendId);
  if (!friend) {
    throw new NotFoundError("Friend not found");
  }

  if (user.friends.some((f) => f.toString() === friendId.toString())) {
    throw new ValidationError("Friend already added!");
  }

  user.friends.push(friendId);
  await user.save();

  if (!friend.friends.map((id) => id.toString()).includes(userId.toString())) {
    friend.friends.push(userId);
    await friend.save();
  }

  return { friendId };
};

const addPaymentMethod = async (userId, { methodType, accountDetails }) => {
  if (!methodType || !accountDetails) {
    throw new ValidationError("Payment method and account details are required");
  }

  if (!PAYMENT_MODES.includes(methodType)) {
    throw new ValidationError("Invalid payment method");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  const existingPayment = user.paymentMethods.find(
    (payment) =>
      payment.methodType === methodType && payment.accountDetails === accountDetails
  );

  if (existingPayment) {
    throw new ValidationError("This payment method is already added.");
  }

  user.paymentMethods.push({ methodType, accountDetails });
  await user.save();

  return {
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    gender: user.gender || "Other",
    googleId: user.googleId,
    profilePic: user.profilePic || "",
    friends: user.friends,
    paymentMethods: user.paymentMethods,
  };
};

const deleteFriend = async (userId, friendId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  user.friends = user.friends.filter((friend) => friend.toString() !== friendId);
  await user.save();

  return { friends: user.friends };
};

const deletePayment = async (userId, paymentId) => {
  if (!paymentId) {
    throw new ValidationError("Payment ID is required");
  }

  logger.debug(`Attempting to delete payment ${paymentId}`);

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  const paymentExists = user.paymentMethods.some(
    (payment) => payment._id.toString() === paymentId
  );
  if (!paymentExists) {
    throw new NotFoundError("Payment method not found");
  }

  user.paymentMethods = user.paymentMethods.filter(
    (payment) => payment._id.toString() !== paymentId
  );
  await user.save();

  logger.debug(`Removed payment method ${paymentId}`);

  return { paymentMethods: user.paymentMethods };
};

module.exports = {
  uploadProfilePicture,
  getUserProfile,
  changePassword,
  searchFriends,
  addFriend,
  addPaymentMethod,
  updateProfile,
  deleteFriend,
  deletePayment,
};
