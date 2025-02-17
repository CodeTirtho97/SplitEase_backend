require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const { connectRedis } = require("./config/redis");

const profileRoutes = require("./routes/profileRoutes");
const authRoutes = require("./routes/authRoutes");

const passport = require("passport");
require("./config/passport"); // Import Passport Config

const expenseRoutes = require("./routes/expenseRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const groupRoutes = require("./routes/groupRoutes");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB & Redis with Error Handling
(async () => {
  try {
    await connectDB();
    await connectRedis();
    console.log("✅ Database & Redis connected successfully!");
  } catch (error) {
    console.error("❌ Error connecting to MongoDB/Redis:", error.message);
    process.exit(1); // Exit process if DB connection fails
  }
})();

// Routes
app.use("/api/profile", profileRoutes);
app.use(passport.initialize());
app.use("/api/auth", authRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/groups", groupRoutes);

// Global Error Handling Middleware
app.use((err, req, res, next) => {
  console.error("Server Error:", err.message);
  res.status(500).json({ error: "Server Error", details: err.message });
});

// 🚀 **Only start the server when NOT running Jest tests**
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// ✅ Export app for testing (Do NOT start server in Jest)
module.exports = { app, server };
