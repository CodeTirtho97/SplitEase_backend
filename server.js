require("dotenv").config();
const express = require("express");
const logger = require("./utils/logger");
const http = require("http");
const helmet = require("helmet");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");
const connectDB = require("./config/db");
const { connectRedis, keepAlive } = require("./config/redis");
const { initSocketServer } = require("./config/socket");
const cors = require("cors");
require("./utils/cronJobs"); // side-effect: registers cron jobs
const healthRoutes = require("./routes/healthRoutes");

const profileRoutes = require("./routes/profileRoutes");
const authRoutes = require("./routes/authRoutes");

const passport = require("passport");
require("./config/passport");

const expenseRoutes = require("./routes/expenseRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const groupRoutes = require("./routes/groupRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");

const app = express();

// Security headers — must come before routes
app.use(helmet());
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  next();
});

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

// Passport must be initialized before any route that uses it
app.use(passport.initialize());

// Create HTTP server from Express app (needed for Socket.IO)
const server = http.createServer(app);

// Connect to MongoDB (required) and Redis (optional — degraded mode if unavailable)
(async () => {
  try {
    await connectDB();
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }

  const redisOk = await connectRedis();
  if (redisOk) {
    await keepAlive(1 * 24 * 60 * 60 * 1000);
    logger.info("Redis keep-alive activated");
  } else {
    logger.warn("Redis unavailable — caching, rate limiting, and sessions will be skipped");
  }
})();

// Initialize Socket.IO
const io = initSocketServer(server);

// Swagger API Docs — served at /api/docs
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: "SplitEase API Docs",
    customCss: ".swagger-ui .topbar { display: none }",
    swaggerOptions: { persistAuthorization: true },
  })
);
app.get("/api/docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// Routes
app.use("/api", dashboardRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/auth", authRoutes);
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
app.use((err, req, res, _next) => {
  if (err.isOperational) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  logger.error(`Unexpected server error: ${err.stack || err.message}`);
  res.status(500).json({ message: "Server Error" });
});

// Setup graceful shutdown
process.on("SIGINT", async () => {
  const { shutdown } = require("./config/redis");
  logger.info("Gracefully shutting down server...");
  server.close(() => {
    shutdown();
    process.exit(0);
  });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info("WebSocket server is active");
  });
}

module.exports = { app, server, io };
