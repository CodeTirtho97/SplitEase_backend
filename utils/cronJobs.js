const cron = require("node-cron");
const { fetchAndStoreExchangeRates } = require("../services/exchangeRateService");

// Schedule daily exchange rate update at midnight (00:00 UTC).
// Skipped in test environments to avoid open handle warnings.
if (process.env.NODE_ENV !== "test") {
  cron.schedule("0 0 * * *", async () => {
    try {
      await fetchAndStoreExchangeRates();
    } catch (error) {
      console.error("Error in daily exchange rate update:", error);
    }
  });
}

module.exports = { scheduleExchangeRateUpdate: cron.schedule };
