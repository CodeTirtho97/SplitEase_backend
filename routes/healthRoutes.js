const express = require("express");
const { redisClient } = require("../config/redis");
const mongoose = require("mongoose");

const router = express.Router();

// ✅ Basic Health Check Endpoint
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

    // Check MongoDB connection
    try {
      const mongoStatus = mongoose.connection.readyState;
      healthStatus.services.mongodb = {
        status: mongoStatus === 1 ? "connected" : "disconnected",
        readyState: mongoStatus,
      };
    } catch (error) {
      healthStatus.services.mongodb = {
        status: "error",
        error: error.message,
      };
    }

    // Check Redis connection
    try {
      if (redisClient && redisClient.isReady) {
        await redisClient.ping();
        healthStatus.services.redis = {
          status: "connected",
          isReady: redisClient.isReady,
        };
      } else {
        healthStatus.services.redis = {
          status: "disconnected",
          isReady: false,
        };
      }
    } catch (error) {
      healthStatus.services.redis = {
        status: "error",
        error: error.message,
      };
    }

    // Determine overall health
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

// ✅ Keep-Alive Endpoint (for GitHub Actions)
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

    // Perform Redis operations to keep it active
    if (redisClient && redisClient.isReady) {
      try {
        // Multiple Redis operations to ensure activity
        await redisClient.set(
          `keepalive:${timestamp}`,
          JSON.stringify(keepAliveData),
          {
            EX: 3600, // Expire in 1 hour
          }
        );

        await redisClient.get("keepalive");
        await redisClient.incr("keepalive_counter");

        // Get current counter value
        const currentCounter = await redisClient.get("keepalive_counter");

        keepAliveData.redis = {
          status: "active",
          operations: ["set", "get", "incr"],
          counter: currentCounter,
          lastPing: timestamp,
        };

        console.log(
          `✅ Redis keep-alive successful. Counter: ${currentCounter}`
        );
      } catch (redisError) {
        console.error("❌ Redis keep-alive error:", redisError);
        keepAliveData.redis = {
          status: "error",
          error: redisError.message,
        };
      }
    } else {
      keepAliveData.redis = {
        status: "disconnected",
        message: "Redis client not ready",
      };
    }

    // Send success response
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

// ✅ Redis Health Check Endpoint
router.get("/redis", async (req, res) => {
  try {
    if (!redisClient) {
      return res.status(503).json({
        status: "error",
        message: "Redis client not initialized",
      });
    }

    if (!redisClient.isReady) {
      return res.status(503).json({
        status: "disconnected",
        message: "Redis client not ready",
        isReady: false,
      });
    }

    // Test Redis operations
    const testKey = `health_check:${Date.now()}`;
    const testValue = "health_check_value";

    await redisClient.set(testKey, testValue, { EX: 60 }); // Expire in 1 minute
    const retrievedValue = await redisClient.get(testKey);
    await redisClient.del(testKey); // Clean up

    const redisInfo = {
      status: "healthy",
      isReady: redisClient.isReady,
      testOperation: retrievedValue === testValue ? "success" : "failed",
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(redisInfo);
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

// ✅ Database Health Check Endpoint
router.get("/database", async (req, res) => {
  try {
    const dbStatus = {
      status: "unknown",
      readyState: mongoose.connection.readyState,
      timestamp: new Date().toISOString(),
    };

    // Map readyState to human-readable status
    const stateMap = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };

    dbStatus.status = stateMap[mongoose.connection.readyState] || "unknown";

    // Test database operation
    if (mongoose.connection.readyState === 1) {
      try {
        // Simple database ping
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

// ✅ System Information Endpoint
router.get("/system", (req, res) => {
  try {
    const systemInfo = {
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
    };

    res.status(200).json(systemInfo);
  } catch (error) {
    console.error("System info error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get system information",
      error: error.message,
    });
  }
});

// ✅ Comprehensive Status Endpoint (combines all checks)
router.get("/status", async (req, res) => {
  try {
    const overallStatus = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {},
    };

    // MongoDB check
    try {
      const mongoReady = mongoose.connection.readyState === 1;
      if (mongoReady) {
        await mongoose.connection.db.admin().ping();
      }
      overallStatus.checks.mongodb = {
        status: mongoReady ? "healthy" : "unhealthy",
        readyState: mongoose.connection.readyState,
      };
    } catch (error) {
      overallStatus.checks.mongodb = {
        status: "error",
        error: error.message,
      };
    }

    // Redis check
    try {
      if (redisClient && redisClient.isReady) {
        await redisClient.ping();
        overallStatus.checks.redis = {
          status: "healthy",
          isReady: true,
        };
      } else {
        overallStatus.checks.redis = {
          status: "unhealthy",
          isReady: false,
        };
      }
    } catch (error) {
      overallStatus.checks.redis = {
        status: "error",
        error: error.message,
      };
    }

    // Determine overall status
    const allHealthy = Object.values(overallStatus.checks).every(
      (check) => check.status === "healthy"
    );

    if (!allHealthy) {
      overallStatus.status = "degraded";
    }

    const statusCode = overallStatus.status === "healthy" ? 200 : 503;
    res.status(statusCode).json(overallStatus);
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
