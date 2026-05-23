const express = require("express");
const { redisClient } = require("../config/redis");
const mongoose = require("mongoose");

const router = express.Router();

/**
 * @swagger
 * /api/health/health:
 *   get:
 *     summary: Overall system health check
 *     description: >
 *       Pings both MongoDB and Redis and returns a combined health status.
 *       Returns HTTP 200 when all services are healthy, or HTTP 503 with
 *       `"status": "degraded"` when one or more services are unavailable.
 *       Used by uptime monitors and load balancers.
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: All services healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthStatus'
 *       503:
 *         description: One or more services degraded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthStatus'
 */
router.get("/health", async (req, res) => {
  try {
    const healthStatus = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      version: process.env.npm_package_version || "1.0.0",
      services: {},
    };

    try {
      const mongoStatus = mongoose.connection.readyState;
      healthStatus.services.mongodb = {
        status: mongoStatus === 1 ? "connected" : "disconnected",
        readyState: mongoStatus,
      };
    } catch (error) {
      healthStatus.services.mongodb = { status: "error", error: error.message };
    }

    try {
      if (redisClient && redisClient.isReady) {
        await redisClient.ping();
        healthStatus.services.redis = {
          status: "connected",
          isReady: redisClient.isReady,
        };
      } else {
        healthStatus.services.redis = { status: "disconnected", isReady: false };
      }
    } catch (error) {
      healthStatus.services.redis = { status: "error", error: error.message };
    }

    const allServicesHealthy = Object.values(healthStatus.services).every(
      (service) => service.status === "connected"
    );

    if (!allServicesHealthy) {
      healthStatus.status = "degraded";
      return res.status(503).json(healthStatus);
    }

    res.status(200).json(healthStatus);
  } catch (error) {
    console.error("Health check error:", error);
    res.status(500).json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/health/keepalive:
 *   post:
 *     summary: Keep-alive ping for Redis and server
 *     description: >
 *       Performs a set/get/incr sequence on Upstash Redis to prevent the
 *       free-tier instance from being deleted due to inactivity. Called
 *       automatically by a GitHub Actions workflow on a scheduled interval.
 *       The endpoint also logs server uptime and memory usage for diagnostics.
 *     tags: [Health]
 *     security: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               source:
 *                 type: string
 *                 description: Identifier of the caller (e.g. "github-actions")
 *                 example: github-actions
 *               action:
 *                 type: string
 *                 description: Action label for logging
 *                 example: ping
 *     responses:
 *       200:
 *         description: Keep-alive successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Keep-alive ping successful
 *                 data:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     redis:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           example: active
 *                         counter:
 *                           type: string
 *                           example: "42"
 *                 nextPing:
 *                   type: string
 *                   example: Recommended in 10-60 minutes
 */
router.post("/keepalive", async (req, res) => {
  try {
    const { source, action } = req.body;
    const timestamp = new Date().toISOString();

    console.log(
      `🔄 Keep-alive ping received from: ${source || "unknown"} at ${timestamp}`
    );

    const keepAliveData = {
      timestamp,
      source: source || "unknown",
      action: action || "ping",
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid,
      },
    };

    if (redisClient && redisClient.isReady) {
      try {
        await redisClient.set(
          `keepalive:${timestamp}`,
          JSON.stringify(keepAliveData),
          { EX: 3600 }
        );
        await redisClient.get("keepalive");
        await redisClient.incr("keepalive_counter");
        const currentCounter = await redisClient.get("keepalive_counter");

        keepAliveData.redis = {
          status: "active",
          operations: ["set", "get", "incr"],
          counter: currentCounter,
          lastPing: timestamp,
        };

        console.log(`✅ Redis keep-alive successful. Counter: ${currentCounter}`);
      } catch (redisError) {
        console.error("❌ Redis keep-alive error:", redisError);
        keepAliveData.redis = { status: "error", error: redisError.message };
      }
    } else {
      keepAliveData.redis = {
        status: "disconnected",
        message: "Redis client not ready",
      };
    }

    res.status(200).json({
      message: "Keep-alive ping successful",
      data: keepAliveData,
      nextPing: "Recommended in 10-60 minutes",
    });
  } catch (error) {
    console.error("❌ Keep-alive error:", error);
    res.status(500).json({
      message: "Keep-alive ping failed",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /api/health/redis:
 *   get:
 *     summary: Redis-specific health check
 *     description: >
 *       Performs a write/read/delete cycle on a temporary key to verify that
 *       Redis is not just connected but fully functional. Returns 503 if the
 *       client is not ready or the test operation fails.
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Redis is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 isReady:
 *                   type: boolean
 *                   example: true
 *                 testOperation:
 *                   type: string
 *                   enum: [success, failed]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       503:
 *         description: Redis is unavailable or test operation failed
 */
router.get("/redis", async (req, res) => {
  try {
    if (!redisClient) {
      return res
        .status(503)
        .json({ status: "error", message: "Redis client not initialized" });
    }

    if (!redisClient.isReady) {
      return res.status(503).json({
        status: "disconnected",
        message: "Redis client not ready",
        isReady: false,
      });
    }

    const testKey = `health_check:${Date.now()}`;
    const testValue = "health_check_value";

    await redisClient.set(testKey, testValue, { EX: 60 });
    const retrievedValue = await redisClient.get(testKey);
    await redisClient.del(testKey);

    res.status(200).json({
      status: "healthy",
      isReady: redisClient.isReady,
      testOperation: retrievedValue === testValue ? "success" : "failed",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Redis health check error:", error);
    res.status(503).json({
      status: "error",
      message: "Redis health check failed",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /api/health/database:
 *   get:
 *     summary: MongoDB health check
 *     description: >
 *       Checks Mongoose connection state and executes an admin `ping` command
 *       against the database to verify end-to-end connectivity. Returns 503
 *       if the connection is in any state other than `connected` (1).
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Database is connected and responding
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: connected
 *                 readyState:
 *                   type: integer
 *                   example: 1
 *                 ping:
 *                   type: string
 *                   enum: [successful, failed]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       503:
 *         description: Database not connected
 */
router.get("/database", async (req, res) => {
  try {
    const stateMap = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
    const dbStatus = {
      status: stateMap[mongoose.connection.readyState] || "unknown",
      readyState: mongoose.connection.readyState,
      timestamp: new Date().toISOString(),
    };

    if (mongoose.connection.readyState === 1) {
      try {
        await mongoose.connection.db.admin().ping();
        dbStatus.ping = "successful";
      } catch (pingError) {
        dbStatus.ping = "failed";
        dbStatus.pingError = pingError.message;
      }
    }

    const statusCode =
      dbStatus.status === "connected" && dbStatus.ping === "successful"
        ? 200
        : 503;
    res.status(statusCode).json(dbStatus);
  } catch (error) {
    console.error("Database health check error:", error);
    res.status(503).json({
      status: "error",
      message: "Database health check failed",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /api/health/system:
 *   get:
 *     summary: Server system information
 *     description: >
 *       Returns Node.js runtime details: process uptime, memory usage (heap,
 *       external, RSS), PID, platform, architecture, and environment.
 *       Does not require authentication — useful for ops dashboards.
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: System info returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 server:
 *                   type: object
 *                   properties:
 *                     uptime:
 *                       type: number
 *                       example: 3600.5
 *                     memory:
 *                       type: object
 *                     pid:
 *                       type: integer
 *                     version:
 *                       type: string
 *                       example: v20.10.0
 *                     platform:
 *                       type: string
 *                       example: linux
 *                 environment:
 *                   type: object
 *                   properties:
 *                     nodeEnv:
 *                       type: string
 *                       example: production
 *                     port:
 *                       type: integer
 *                       example: 5000
 */
router.get("/system", (req, res) => {
  try {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid,
        version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || "development",
        port: process.env.PORT || 5000,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    });
  } catch (error) {
    console.error("System info error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get system information",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/health/status:
 *   get:
 *     summary: Comprehensive status check (all services)
 *     description: >
 *       Combines MongoDB and Redis checks into a single response with an
 *       aggregated `"healthy"` or `"degraded"` status. Ideal for external
 *       uptime monitoring services that prefer a single endpoint.
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: All services healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, degraded]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                 checks:
 *                   type: object
 *                   properties:
 *                     mongodb:
 *                       type: object
 *                     redis:
 *                       type: object
 *       503:
 *         description: One or more services degraded
 */
router.get("/status", async (req, res) => {
  try {
    const overallStatus = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {},
    };

    try {
      const mongoReady = mongoose.connection.readyState === 1;
      if (mongoReady) await mongoose.connection.db.admin().ping();
      overallStatus.checks.mongodb = {
        status: mongoReady ? "healthy" : "unhealthy",
        readyState: mongoose.connection.readyState,
      };
    } catch (error) {
      overallStatus.checks.mongodb = { status: "error", error: error.message };
    }

    try {
      if (redisClient && redisClient.isReady) {
        await redisClient.ping();
        overallStatus.checks.redis = { status: "healthy", isReady: true };
      } else {
        overallStatus.checks.redis = { status: "unhealthy", isReady: false };
      }
    } catch (error) {
      overallStatus.checks.redis = { status: "error", error: error.message };
    }

    const allHealthy = Object.values(overallStatus.checks).every(
      (check) => check.status === "healthy"
    );
    if (!allHealthy) overallStatus.status = "degraded";

    res
      .status(overallStatus.status === "healthy" ? 200 : 503)
      .json(overallStatus);
  } catch (error) {
    console.error("Status check error:", error);
    res.status(500).json({
      status: "error",
      message: "Status check failed",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
