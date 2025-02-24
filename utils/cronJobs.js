const cron = require("node-cron");
const { fetchAndStoreExchangeRates } = require("../services/expenseService"); // Adjust path as needed

// Schedule daily exchange rate update at midnight (00:00 UTC)
cron.schedule("0 0 * * *", async () => {
  //console.log("Running daily exchange rate update...");
  try {
    await fetchAndStoreExchangeRates();
  } catch (error) {
    //console.error("Error in daily exchange rate update:", error);
  }
});

module.exports = { scheduleExchangeRateUpdate: cron.schedule };
