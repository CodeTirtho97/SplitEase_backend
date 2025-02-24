const mongoose = require("mongoose");

// Model for storing exchange rates
const exchangeRateSchema = new mongoose.Schema({
  baseCurrency: String,
  rates: Object,
  timestamp: Date,
});

module.exports = mongoose.model("Expense", exchangeRateSchema);
