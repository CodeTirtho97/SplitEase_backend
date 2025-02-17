const mongoose = require("mongoose");

// Middleware to validate MongoDB ObjectId in request parameters
const validateObjectId = (req, res, next) => {
  const keys = Object.keys(req.params);
  for (const key of keys) {
    if (!mongoose.Types.ObjectId.isValid(req.params[key])) {
      return res
        .status(400)
        .json({ message: `Invalid ObjectId: ${req.params[key]}` });
    }
  }
  next();
};

module.exports = validateObjectId;
