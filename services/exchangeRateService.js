const axios = require("axios");
require("dotenv").config();
const ExchangeRate = require("../models/ExchangeRate");
const { AppError } = require("../utils/AppError");
const logger = require("../utils/logger");

const getFallbackFromCache = async () => {
  try {
    const BASE_CURRENCY = process.env.BASE_CURRENCY || "INR";
    const cachedRate = await ExchangeRate.findOne({ baseCurrency: BASE_CURRENCY }).sort({
      timestamp: -1,
    });
    if (cachedRate) return cachedRate.rates;
    return { INR: 1, USD: 0.012, EUR: 0.011, GBP: 0.0095, JPY: 1.8 };
  } catch (error) {
    logger.error(`Error getting fallback rates: ${error.message}`);
    return { INR: 1, USD: 0.012, EUR: 0.011, GBP: 0.0095, JPY: 1.8 };
  }
};

const fetchAndStoreExchangeRates = async (forceUpdate = false) => {
  try {
    const EXCHANGE_URL = process.env.EXCHANGE_RATE_URL;
    const API_KEY = process.env.EXCHANGERATES_API_KEY;
    const BASE_CURRENCY = process.env.BASE_CURRENCY || "INR";

    if (!EXCHANGE_URL) {
      logger.warn("EXCHANGE_RATE_URL is missing in .env file, using fallback rates");
      return await getFallbackFromCache();
    }
    if (!API_KEY) {
      logger.warn("EXCHANGERATES_API_KEY is missing in .env file, using fallback rates");
      return await getFallbackFromCache();
    }

    const exchangeRatesUrl = `${EXCHANGE_URL}?access_key=${API_KEY}&base=${BASE_CURRENCY}`;
    const response = await axios.get(exchangeRatesUrl, {
      timeout: 10000,
      headers: { apikey: API_KEY, "User-Agent": "SplitEase-App/1.0" },
    });

    const rates = response.data.rates;
    if (!rates || Object.keys(rates).length === 0) {
      throw new Error("No exchange rates returned from API");
    }

    if (forceUpdate) {
      await ExchangeRate.deleteMany({ baseCurrency: BASE_CURRENCY });
    }

    await ExchangeRate.findOneAndUpdate(
      { baseCurrency: BASE_CURRENCY },
      { rates, timestamp: new Date() },
      { upsert: true, new: true }
    );

    return rates;
  } catch (error) {
    logger.error(`Error fetching exchange rates: ${error.message}`);
    try {
      return await getFallbackFromCache();
    } catch (fallbackError) {
      logger.error(`Error getting fallback rates: ${fallbackError.message}`);
      throw new AppError(`Failed to fetch exchange rates: ${error.message}`, 500);
    }
  }
};

const updateExchangeRates = async () => {
  const rates = await fetchAndStoreExchangeRates(true);
  return { rates };
};

const getExchangeRates = async () => {
  const exchangeRates = await ExchangeRate.findOne().sort({ timestamp: -1 }).exec();
  if (!exchangeRates) {
    throw new AppError("No exchange rates found in database", 404);
  }
  return exchangeRates;
};

module.exports = {
  getFallbackFromCache,
  fetchAndStoreExchangeRates,
  updateExchangeRates,
  getExchangeRates,
};
