require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const { connectRedis } = require("./config/redis");
const cors = require("cors");
const cronJobs = require("./utils/cronJobs");

const profileRoutes = require("./routes/profileRoutes");
const authRoutes = require("./routes/authRoutes");

const passport = require("passport");
require("./config/passport"); // Import Passport Config

const expenseRoutes = require("./routes/expenseRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const groupRoutes = require("./routes/groupRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const allowedOrigins = [
  "http://localhost:3000",
  "https://split-ease-v1-tirth.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // Allow cookies and authentication
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"], // Allow all HTTP methods
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
    ], // Allow common headers
    optionsSuccessStatus: 200, // Some browsers (e.g., IE) require this
  })
);

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
app.use("/api", dashboardRoutes);
app.use("/api/profile", profileRoutes);
app.use(passport.initialize());
// Apply CORS specifically to /api/auth routes
app.use(
  "/api/auth",
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
    ],
    optionsSuccessStatus: 200,
  }),
  authRoutes
);
app.use("/api/expenses", expenseRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/groups", groupRoutes);

// Handle preflight requests
app.options(
  "*",
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
    ],
    optionsSuccessStatus: 200,
  })
);

// Global Error Handling Middleware
app.use((err, req, res, next) => {
  console.error("Server Error:", err.message);
  res.status(500).json({ error: "Server Error", details: err.message });
});

app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  next();
});

// 🚀 **Only start the server when NOT running Jest tests**
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// ✅ Export app for testing (Do NOT start server in Jest)
module.exports = { app, server };
