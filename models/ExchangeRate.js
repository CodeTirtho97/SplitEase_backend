const mongoose = require("mongoose");

const exchangeRateSchema = new mongoose.Schema({
  baseCurrency: String,
  rates: Object,
  timestamp: Date,
});

module.exports = mongoose.model("ExchangeRate", exchangeRateSchema);
