const {
  getExpenseSummary,
  getRecentExpenses,
  getExpenseBreakdown,
} = require("../services/analyticsService");

const getExpenseSummaryHandler = async (req, res, next) => {
  try {
    const summary = await getExpenseSummary(req.user.id);
    res.status(200).json({ message: "Expense summary fetched successfully", summary });
  } catch (error) {
    next(error);
  }
};

const getRecentExpensesHandler = async (req, res, next) => {
  try {
    const expenses = await getRecentExpenses(req.user.id);
    res.status(200).json({ message: "Recent expenses fetched successfully", expenses });
  } catch (error) {
    next(error);
  }
};

const getExpenseBreakdownHandler = async (req, res, next) => {
  try {
    const result = await getExpenseBreakdown(req.user.id, req.params.currency);
    res.status(200).json({ message: "Expense breakdown fetched successfully", ...result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getExpenseSummary: getExpenseSummaryHandler,
  getRecentExpenses: getRecentExpensesHandler,
  getExpenseBreakdown: getExpenseBreakdownHandler,
};
