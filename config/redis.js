const { createClient } = require("redis");

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

redisClient.on("error", (err) => console.error("❌ Redis Error:", err));
redisClient.on("connect", () => console.log("✅ Connected to Upstash Redis"));

const connectRedis = async () => {
  try {
    await redisClient.connect();
    console.log("🔄 Redis is Ready");
  } catch (error) {
    console.error("❌ Redis Connection Failed:", error.message);
    process.exit(1);
  }
};

module.exports = { redisClient, connectRedis };
