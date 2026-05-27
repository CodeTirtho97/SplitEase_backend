const { updateExchangeRates } = require("../services/exchangeRateService");

const updateExchangeRatesHandler = async (req, res, next) => {
  try {
    const result = await updateExchangeRates();
    res.status(200).json({ message: "Exchange rates updated successfully", ...result });
  } catch (error) {
    next(error);
  }
};

module.exports = { updateExchangeRates: updateExchangeRatesHandler };
