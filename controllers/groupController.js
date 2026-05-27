const {
  createGroup,
  getUserGroups,
  viewGroupDetails,
  editGroup,
  deleteGroup,
  getUserFriends,
  getGroupDebtSummary,
} = require("../services/groupService");

const createGroupHandler = async (req, res, next) => {
  try {
    const result = await createGroup(req.user.id, req.body);
    res.status(201).json({ message: "Group created successfully", ...result });
  } catch (error) {
    next(error);
  }
};

const getUserGroupsHandler = async (req, res, next) => {
  try {
    const result = await getUserGroups(req.user.id);
    res.status(200).json({ message: "Groups fetched successfully", ...result });
  } catch (error) {
    next(error);
  }
};

const viewGroupDetailsHandler = async (req, res, next) => {
  try {
    const result = await viewGroupDetails(req.params.groupId);
    res.status(200).json({ message: "Group details fetched successfully", ...result });
  } catch (error) {
    next(error);
  }
};

const editGroupHandler = async (req, res, next) => {
  try {
    const result = await editGroup(req.params.groupId, req.user.id, req.body);
    res.status(200).json({ message: "Group updated successfully", ...result });
  } catch (error) {
    next(error);
  }
};

const deleteGroupHandler = async (req, res, next) => {
  try {
    await deleteGroup(req.params.groupId, req.user.id);
    res.status(200).json({ message: "Group deleted successfully." });
  } catch (error) {
    next(error);
  }
};

const getUserFriendsHandler = async (req, res, next) => {
  try {
    const result = await getUserFriends(req.user.id);
    res.status(200).json({ message: "Friends fetched successfully", ...result });
  } catch (error) {
    next(error);
  }
};

const getGroupDebtSummaryHandler = async (req, res, next) => {
  try {
    const result = await getGroupDebtSummary(req.params.groupId, req.user.id);
    res.status(200).json({ message: "Group debt summary computed successfully", ...result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createGroup: createGroupHandler,
  getUserGroups: getUserGroupsHandler,
  viewGroupDetails: viewGroupDetailsHandler,
  editGroup: editGroupHandler,
  deleteGroup: deleteGroupHandler,
  getUserFriends: getUserFriendsHandler,
  getGroupDebtSummary: getGroupDebtSummaryHandler,
};
