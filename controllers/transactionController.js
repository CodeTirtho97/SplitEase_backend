const {
  getPendingTransactions,
  getTransactionHistory,
  settleTransaction,
} = require("../services/transactionService");

const getPendingHandler = async (req, res, next) => {
  try {
    const result = await getPendingTransactions(req.user.id);
    res.status(200).json({ message: "Pending transactions fetched successfully", ...result });
  } catch (error) {
    next(error);
  }
};

const getHistoryHandler = async (req, res, next) => {
  try {
    const result = await getTransactionHistory(req.user.id);
    res.status(200).json({ message: "Transaction history fetched successfully", ...result });
  } catch (error) {
    next(error);
  }
};

const settleHandler = async (req, res, next) => {
  try {
    const result = await settleTransaction(req.params.transactionId, req.user.id, req.body);
    const statusWord = req.body.status === "Success" ? "success" : "fail";
    res.status(200).json({
      message: `Transaction ${statusWord}fully settled`,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPendingTransactions: getPendingHandler,
  getTransactionHistory: getHistoryHandler,
  settleTransaction: settleHandler,
};
