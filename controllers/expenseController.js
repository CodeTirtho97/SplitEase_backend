const {
  createExpense,
  getGroupExpenses,
  getUserExpenses,
  getExpenseById,
  deleteExpense,
} = require("../services/expenseService");

const createExpenseHandler = async (req, res, next) => {
  try {
    const result = await createExpense(req.body);
    res.status(201).json({ message: "Expense added successfully with transactions", ...result });
  } catch (error) {
    next(error);
  }
};

const getGroupExpensesHandler = async (req, res, next) => {
  try {
    const result = await getGroupExpenses(req.params.groupId);
    res.json({ message: "Expenses fetched successfully.", ...result });
  } catch (error) {
    next(error);
  }
};

const getUserExpensesHandler = async (req, res, next) => {
  try {
    const result = await getUserExpenses(req.user.id);
    res.status(200).json({ message: "User expenses fetched successfully.", ...result });
  } catch (error) {
    next(error);
  }
};

const getExpenseByIdHandler = async (req, res, next) => {
  try {
    const result = await getExpenseById(req.params.expenseId);
    res.status(200).json({ message: "Expense details fetched successfully.", ...result });
  } catch (error) {
    next(error);
  }
};

const deleteExpenseHandler = async (req, res, next) => {
  try {
    await deleteExpense(req.params.expenseId, req.user.id);
    res.status(200).json({ message: "Expense deleted successfully" });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createExpense: createExpenseHandler,
  getGroupExpenses: getGroupExpensesHandler,
  getUserExpenses: getUserExpensesHandler,
  getExpenseById: getExpenseByIdHandler,
  deleteExpense: deleteExpenseHandler,
};
