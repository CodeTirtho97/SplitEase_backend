const { createClient } = require("redis");
require("dotenv").config();

const redisUrl = process.env.REDIS_URL;

// Ensure the Redis URL is valid
if (!redisUrl.startsWith("rediss://")) {
  console.error("❌ Invalid Redis URL: Must use 'rediss://' for Upstash.");
  process.exit(1);
}

const redisClient = createClient({
  url: redisUrl,
  socket: {
    tls: true, // Required for secure connection
    rejectUnauthorized: false, // Prevents SSL verification issues
  },
});

// Enhanced error handling with reconnection logic
redisClient.on("error", (err) => {
  console.error("❌ Redis Error:", err);
  // Implement reconnection strategy
  setTimeout(() => {
    console.log("🔄 Attempting to reconnect to Redis...");
    redisClient.connect().catch(console.error);
  }, 5000); // Retry after 5 seconds
});

redisClient.on("connect", () => console.log("✅ Connected to Upstash Redis"));
redisClient.on("ready", () => console.log("🟢 Redis Client Ready"));
redisClient.on("reconnecting", () => console.log("🔄 Redis Reconnecting..."));
redisClient.on("end", () => console.log("🔴 Redis Connection Ended"));

// Cache middleware for Express routes
const cacheMiddleware = (duration) => {
  return async (req, res, next) => {
    if (!redisClient.isReady) {
      return next(); // Skip caching if Redis is not connected
    }

    // Create a unique key based on the route and query parameters
    const key = `cache:${req.originalUrl || req.url}`;

    try {
      const cachedResponse = await redisClient.get(key);

      if (cachedResponse) {
        // Return cached response
        console.log(`🚀 Cache hit for ${key}`);
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
            .catch(console.error);
        }

        // Call the original send function
        originalSend.call(this, body);
      };

      next();
    } catch (error) {
      console.error(`❌ Cache Error: ${error.message}`);
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
    const key = `ratelimit:${ip}:${req.originalUrl || req.url}`;

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
      console.error(`❌ Rate Limit Error: ${error.message}`);
      next();
    }
  };
};

// Session storage with Redis
const storeSession = async (userId, token, expiry = 60 * 60 * 24 * 7) => {
  if (!redisClient.isReady) {
    throw new Error("Redis client not ready");
  }

  const key = `session:${userId}`;
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

  const key = `session:${userId}`;
  const storedToken = await redisClient.get(key);

  return storedToken === token;
};

// Delete session (for logout)
const deleteSession = async (userId) => {
  if (!redisClient.isReady) {
    return false;
  }

  const key = `session:${userId}`;
  await redisClient.del(key);

  return true;
};

// Clear cache for a specific pattern (useful when data is updated)
const clearCache = async (pattern) => {
  if (!redisClient.isReady) {
    return false;
  }

  const keys = await redisClient.keys(`cache:${pattern}`);

  if (keys.length > 0) {
    await redisClient.del(keys);
    console.log(`🧹 Cleared ${keys.length} cache entries matching ${pattern}`);
  }

  return true;
};

// Pub/Sub for real-time events
const publisher = redisClient.duplicate();
const subscriber = redisClient.duplicate();

// Connect Redis client and duplicates
const connectRedis = async () => {
  try {
    // Connect all clients and wait for them
    await redisClient.connect();
    await publisher.connect();
    await subscriber.connect();

    console.log("🔄 All Redis connections are Ready");
    return true;
  } catch (error) {
    console.error("❌ Redis Connection Failed:", error.message);
    throw error; // Throw instead of exiting to allow caller to handle
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
        console.error(`❌ Error processing message from ${channel}:`, error);
      }
    });

    console.log(`🔔 Subscribed to channel: ${channel}`);
    return true;
  } catch (error) {
    console.error(`❌ Error subscribing to channel ${channel}:`, error);
    throw error;
  }
};

module.exports = {
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
};
