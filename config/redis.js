const { createClient } = require("redis");
const logger = require("../utils/logger");
require("dotenv").config();

// Namespace prefix — keeps SplitEase keys/channels isolated when sharing a
// Redis instance with another project. Set REDIS_KEY_PREFIX in your env to
// override (e.g. "se:" or "splitease:"). Default: "splitease:".
const KEY_PREFIX = process.env.REDIS_KEY_PREFIX || "splitease:";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl || !redisUrl.startsWith("rediss://")) {
  logger.error("Invalid or missing REDIS_URL — must start with 'rediss://'");
  process.exit(1);
}

// Exponential backoff: 1s → 2s → 4s → … capped at 30s.
// Returning false after 10 retries stops the built-in reconnect so the
// process doesn't spin forever when the host is permanently unreachable.
const reconnectStrategy = (retries) => {
  if (retries >= 10) {
    logger.error("Redis: maximum reconnect attempts reached — giving up");
    return false; // stop retrying
  }
  const delay = Math.min(1000 * Math.pow(2, retries), 30000);
  logger.warn(`Redis reconnect attempt ${retries + 1} — retrying in ${delay}ms`);
  return delay;
};

const makeClient = () =>
  createClient({
    url: redisUrl,
    socket: {
      tls: true,
      rejectUnauthorized: false,
      reconnectStrategy,
    },
  });

const redisClient = makeClient();

// Log errors only — the reconnectStrategy handles retries automatically.
// Do NOT call redisClient.connect() here; that fights the built-in reconnect
// and causes "Socket already opened" errors.
redisClient.on("error", (err) => logger.error(`Redis error: ${err.message}`));
redisClient.on("connect", () => logger.info("Redis connected"));
redisClient.on("ready", () => logger.info("Redis ready"));
redisClient.on("reconnecting", () => logger.warn("Redis reconnecting…"));
redisClient.on("end", () => logger.warn("Redis connection ended"));

// NEW: Keep-alive mechanism to prevent database deletion due to inactivity
let keepAliveInterval = null;

const keepAlive = async (interval = 7 * 24 * 60 * 60 * 1000) => {
  // Default: once a week
  const pingRedis = async () => {
    try {
      if (!redisClient.isReady) {
        await connectRedis();
      }
      const timestamp = new Date().toISOString();

      // Perform both read and write operations to ensure activity
      await redisClient.set(`${KEY_PREFIX}keepalive`, timestamp, { EX: 86400 });
      await redisClient.get(`${KEY_PREFIX}keepalive`);
      await redisClient.incr(`${KEY_PREFIX}ping_counter`);

      logger.info(`Redis keep-alive ping sent at ${timestamp}`);
    } catch (error) {
      logger.error(`Redis keep-alive error: ${error.message}`);
      try {
        await connectRedis();
      } catch (reconnectError) {
        logger.error(`Redis reconnection failed: ${reconnectError.message}`);
      }
    }
  };

  // Clear any existing interval
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }

  // Initial ping
  await pingRedis();

  // Schedule regular pings
  keepAliveInterval = setInterval(pingRedis, interval);

  return true;
};

// Cache middleware for Express routes
const cacheMiddleware = (duration) => {
  return async (req, res, next) => {
    if (!redisClient.isReady) {
      return next(); // Skip caching if Redis is not connected
    }

    // Create a unique key based on the route and query parameters
    const key = `${KEY_PREFIX}cache:${req.originalUrl || req.url}`;

    try {
      const cachedResponse = await redisClient.get(key);

      if (cachedResponse) {
        // Return cached response
        logger.info(`Cache hit: ${key}`);
        return res.json(JSON.parse(cachedResponse));
      }

      // Store the original send function
      const originalSend = res.send;

      // Override the send function
      res.send = function (body) {
        if (res.statusCode === 200) {
          // Only cache successful responses
          redisClient
            .set(key, body, {
              EX: duration, // Set expiration in seconds
            })
            .catch((err) => logger.error(`Cache write error: ${err.message}`));
        }

        // Call the original send function
        originalSend.call(this, body);
      };

      next();
    } catch (error) {
      logger.error(`Cache error: ${error.message}`);
      next();
    }
  };
};

// Rate limiting middleware
const rateLimiter = (requests, per, errorMessage = "Too many requests") => {
  return async (req, res, next) => {
    if (!redisClient.isReady) {
      return next(); // Skip rate limiting if Redis is not connected
    }

    // Get client IP address
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const key = `${KEY_PREFIX}ratelimit:${ip}:${req.originalUrl || req.url}`;

    try {
      // Get current count for this IP and endpoint
      const count = await redisClient.get(key);

      // If no count exists, create it
      if (!count) {
        await redisClient.set(key, 1, {
          EX: per, // Set expiration in seconds
        });
        return next();
      }

      // If count exists but is less than limit, increment it
      if (parseInt(count) < requests) {
        await redisClient.incr(key);
        return next();
      }

      // Rate limit exceeded
      return res.status(429).json({ message: errorMessage });
    } catch (error) {
      logger.error(`Rate limit error: ${error.message}`);
      next();
    }
  };
};

// Session storage with Redis
const storeSession = async (userId, token, expiry = 60 * 60 * 24 * 7) => {
  if (!redisClient.isReady) {
    throw new Error("Redis client not ready");
  }

  const key = `${KEY_PREFIX}session:${userId}`;
  await redisClient.set(key, token, {
    EX: expiry, // Expires in seconds (default 7 days)
  });

  return true;
};

// Validate session
const validateSession = async (userId, token) => {
  if (!redisClient.isReady) {
    return false;
  }

  const key = `${KEY_PREFIX}session:${userId}`;
  const storedToken = await redisClient.get(key);

  return storedToken === token;
};

// Delete session (for logout)
const deleteSession = async (userId) => {
  if (!redisClient.isReady) {
    return false;
  }

  const key = `${KEY_PREFIX}session:${userId}`;
  await redisClient.del(key);

  return true;
};

// Clear cache for a specific pattern (useful when data is updated)
const clearCache = async (pattern) => {
  if (!redisClient.isReady) {
    return false;
  }

  const keys = await redisClient.keys(`${KEY_PREFIX}cache:${pattern}`);

  if (keys.length > 0) {
    await redisClient.del(keys);
    logger.info(`Cleared ${keys.length} cache entries matching ${pattern}`);
  }

  return true;
};

// Pub/Sub clients — duplicated so they each have an independent socket.
// They inherit the reconnectStrategy from the parent client config.
const publisher = redisClient.duplicate();
const subscriber = redisClient.duplicate();

publisher.on("error", (err) => logger.error(`Redis publisher error: ${err.message}`));
subscriber.on("error", (err) => logger.error(`Redis subscriber error: ${err.message}`));

// Connect Redis client and pub/sub duplicates.
// Returns true on success; returns false on failure so the caller can decide
// whether to abort the server or run in degraded (no-cache/no-pubsub) mode.
const connectRedis = async () => {
  try {
    await redisClient.connect();
    await publisher.connect();
    await subscriber.connect();
    logger.info("All Redis connections ready");
    return true;
  } catch (error) {
    logger.error(`Redis connection failed: ${error.message}`);
    return false;
  }
};

// Publish an event
const publishEvent = async (channel, message) => {
  if (!publisher.isReady) {
    throw new Error("Redis publisher not ready");
  }

  await publisher.publish(channel, JSON.stringify(message));
};

// Subscribe to an event channel
const subscribeToChannel = (channel, callback) => {
  if (!subscriber.isReady) {
    throw new Error("Redis subscriber not ready");
  }

  try {
    subscriber.subscribe(channel, (message) => {
      try {
        const parsedMessage = JSON.parse(message);
        callback(parsedMessage);
      } catch (error) {
        logger.error(`Error processing message from ${channel}: ${error.message}`);
      }
    });

    logger.info(`Subscribed to channel: ${channel}`);
    return true;
  } catch (error) {
    logger.error(`Error subscribing to channel ${channel}: ${error.message}`);
    throw error;
  }
};

// NEW: Graceful shutdown function to clean up resources
const shutdown = () => {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    logger.info("Redis keep-alive interval cleared");
  }

  if (redisClient.isReady) {
    redisClient.quit();
    publisher.quit();
    subscriber.quit();
    logger.info("Redis connections closed");
  }
};

module.exports = {
  KEY_PREFIX,
  redisClient,
  connectRedis,
  cacheMiddleware,
  rateLimiter,
  storeSession,
  validateSession,
  deleteSession,
  clearCache,
  publishEvent,
  subscribeToChannel,
  keepAlive,
  shutdown,
};
