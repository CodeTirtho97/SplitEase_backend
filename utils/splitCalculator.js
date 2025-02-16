const mongoose = require("mongoose");

/**
 * Function to calculate split details based on splitMethod
 * @param {string} splitMethod - The method to split the expense (Equal, Percentage, Custom)
 * @param {number} totalAmount - Total amount of the expense
 * @param {array} participants - List of participant IDs (excluding payer)
 * @param {array} splitValues - (Optional) Custom split values based on user inputs
 * @returns {array} splitDetails - List of who owes how much and their transactions (Initially null)
 */
const calculateSplitDetails = (
  splitMethod,
  totalAmount,
  participants,
  splitValues
) => {
  let splitDetails = [];

  if (splitMethod === "Equal") {
    const amountPerPerson = totalAmount / participants.length;
    splitDetails = participants.map((id) => ({
      userId: new mongoose.Types.ObjectId(id),
      amountOwed: amountPerPerson,
      percentage: (100 / participants.length).toFixed(2),
      transactionId: null,
    }));
  } else if (splitMethod === "Percentage") {
    const totalPercentage = splitValues.reduce(
      (sum, value) => sum + value.percentage,
      0
    );
    if (totalPercentage !== 100) {
      throw new Error("Total percentage must be exactly 100%");
    }

    splitDetails = splitValues.map((item) => ({
      userId: new mongoose.Types.ObjectId(item.userId),
      amountOwed: (totalAmount * item.percentage) / 100,
      percentage: item.percentage,
      transactionId: null,
    }));
  } else if (splitMethod === "Custom") {
    const totalCustomAmount = splitValues.reduce(
      (sum, value) => sum + value.amount,
      0
    );
    if (totalCustomAmount !== totalAmount) {
      throw new Error("Total split amount must match total expense amount");
    }

    splitDetails = splitValues.map((item) => ({
      userId: new mongoose.Types.ObjectId(item.userId),
      amountOwed: item.amount,
      percentage: ((item.amount / totalAmount) * 100).toFixed(2),
      transactionId: null,
    }));
  }

  return splitDetails;
};

module.exports = { calculateSplitDetails };
