require("dotenv").config();
const express = require("express");
const http = require("http"); // Add HTTP module for Socket.IO
const connectDB = require("./config/db");
const { connectRedis, keepAlive } = require("./config/redis"); // Import keepAlive
const { initSocketServer } = require("./config/socket"); // Import WebSocket setup
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

const allowedOrigins = ["http://localhost:3000", process.env.FRONTEND_URL];

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

// Create HTTP server from Express app (needed for Socket.IO)
const server = http.createServer(app);

// Connect to MongoDB & Redis with Error Handling and Keep-Alive
(async () => {
  try {
    await connectDB();
    await connectRedis();

    // Set up Redis keep-alive to prevent deletion due to inactivity
    // Ping every week (adjust as needed based on Upstash's policy)
    await keepAlive(7 * 24 * 60 * 60 * 1000);

    console.log("✅ Database & Redis connected successfully!");
    console.log("🔄 Redis keep-alive mechanism activated");
  } catch (error) {
    console.error("❌ Error connecting to MongoDB/Redis:", error.message);
    process.exit(1); // Exit process if DB connection fails
  }
})();

// Initialize Socket.IO
const io = initSocketServer(server);

// Routes
app.use("/api", dashboardRoutes);
app.use("/api/profile", profileRoutes);
app.use(passport.initialize());
// Apply CORS specifically to /api/auth routes
app.use(
  "/api/auth",
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        return callback(
          new Error(
            "The CORS policy for this site does not allow access from the specified Origin."
          ),
          false
        );
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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

// Setup graceful shutdown
process.on("SIGINT", async () => {
  const { shutdown } = require("./config/redis");
  console.log("🛑 Gracefully shutting down server...");
  shutdown();
  process.exit(0);
});

// 🚀 **Only start the server when NOT running Jest tests**
const PORT = process.env.PORT || 5000;

// Use 'server' instead of 'app' to start the HTTP server with Socket.IO
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔌 WebSocket server is active`);
});

// ✅ Export app for testing (Do NOT start server in Jest)
module.exports = { app, server, io };
