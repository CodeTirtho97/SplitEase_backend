const {
  uploadProfilePicture,
  getUserProfile,
  changePassword,
  searchFriends,
  addFriend,
  addPaymentMethod,
  updateProfile,
  deleteFriend,
  deletePayment,
} = require("../services/profileService");

const uploadPic = async (req, res, next) => {
  try {
    const result = await uploadProfilePicture(req.user.id, req.file);
    res.status(200).json({ message: "Profile picture updated successfully", ...result });
  } catch (error) {
    next(error);
  }
};

const getProfile = async (req, res, next) => {
  try {
    const profile = await getUserProfile(req.user.id);
    res.json(profile);
  } catch (error) {
    next(error);
  }
};

const updateProfileHandler = async (req, res, next) => {
  try {
    const result = await updateProfile(req.user.id, req.body);
    res.status(200).json({ message: "Profile updated successfully", ...result });
  } catch (error) {
    next(error);
  }
};

const changePasswordHandler = async (req, res, next) => {
  try {
    await changePassword(req.user.id, req.body);
    res.json({ message: "Password updated successfully" });
  } catch (error) {
    next(error);
  }
};

const searchFriendsHandler = async (req, res, next) => {
  try {
    const result = await searchFriends(req.user.id, req.body.friendName);
    res.status(200).json({ message: "Matching friends found", ...result });
  } catch (error) {
    next(error);
  }
};

const addFriendHandler = async (req, res, next) => {
  try {
    const result = await addFriend(req.user.id, req.body.friendId);
    res.status(200).json({ message: "Friend added successfully!", ...result });
  } catch (error) {
    next(error);
  }
};

const addPaymentHandler = async (req, res, next) => {
  try {
    const result = await addPaymentMethod(req.user.id, req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const deleteFriendHandler = async (req, res, next) => {
  try {
    const result = await deleteFriend(req.user.id, req.params.friendId);
    res.json({ message: "Friend removed successfully", ...result });
  } catch (error) {
    next(error);
  }
};

const deletePaymentHandler = async (req, res, next) => {
  try {
    const result = await deletePayment(req.user.id, req.params.paymentId);
    res.status(200).json({ message: "Payment method removed successfully", ...result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadPic,
  getProfile,
  updateProfileHandler,
  changePasswordHandler,
  searchFriendsHandler,
  addFriendHandler,
  addPaymentHandler,
  deleteFriendHandler,
  deletePaymentHandler,
};
