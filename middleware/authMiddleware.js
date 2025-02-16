const jwt = require("jsonwebtoken");
const User = require("../models/User");
require("dotenv").config();

const protect = async (req, res, next) => {
  let token;

  // Check if token exists in Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1]; // Extract token from "Bearer <token>"

      // Verify token using JWT secret
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Find user by decoded ID (excluding password)
      req.user = await User.findById(decoded.id).select("-password");

      if (!req.user) {
        return res.status(401).json({ message: "User not found" });
      }

      next(); // Move to next middleware/controller
    } catch (error) {
      return res
        .status(401)
        .json({ message: "Invalid token", error: error.message });
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }
};

module.exports = protect;
