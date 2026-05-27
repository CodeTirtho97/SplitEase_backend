const { getDashboardStats, getRecentTransactions } = require("../services/dashboardService");
const { clearCache } = require("../config/redis");

const getStats = async (req, res, next) => {
  try {
    const stats = await getDashboardStats(req.user._id);
    res.status(200).json({ message: "Dashboard stats fetched successfully", ...stats });
  } catch (error) {
    next(error);
  }
};

const getRecentTransactionsHandler = async (req, res, next) => {
  try {
    const transactions = await getRecentTransactions(req.user._id);
    res.status(200).json({ transactions });
  } catch (error) {
    next(error);
  }
};

const clearCacheHandler = async (req, res, next) => {
  try {
    await clearCache(`*${req.user._id}*`);
    res.status(200).json({ message: "Cache cleared successfully" });
  } catch (error) {
    next(error);
  }
};

module.exports = { getStats, getRecentTransactionsHandler, clearCacheHandler };
