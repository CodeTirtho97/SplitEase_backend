const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { validateSession } = require("../config/redis");
require("dotenv").config();

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1]; // Extract token

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // First, verify if the token matches what's stored in Redis
      // This allows for token revocation on logout
      try {
        const isValid = await validateSession(decoded.id, token);
        if (!isValid) {
          return res
            .status(401)
            .json({ message: "Session expired or invalid" });
        }
      } catch (error) {
        console.error("Redis session validation error:", error);
        // Continue with JWT validation if Redis is unavailable
      }

      // Fetch user without password
      req.user = await User.findById(decoded.id).select("_id fullName email");

      if (!req.user) {
        return res.status(401).json({ message: "User not found" });
      }

      next(); // Move to next middleware
    } catch (error) {
      return res.status(401).json({ message: "Invalid token" });
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }
};

module.exports = protect;
