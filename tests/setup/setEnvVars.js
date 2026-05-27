const path = require("path");
const fs = require("fs");

// Read MongoDB URI written by globalSetup (runs before any module is loaded)
const uriFile = path.join(__dirname, "../.test-mongo-uri");
process.env.MONGO_URI = fs.readFileSync(uriFile, "utf-8").trim();

process.env.JWT_SECRET = "test-jwt-secret-key-splitease-minimum-32-chars";
process.env.NODE_ENV = "test";

// Must start with rediss:// to pass the format check in config/redis.js.
// The actual config/redis module is replaced by a mock via moduleNameMapper,
// so this URL is never used for a real connection.
process.env.REDIS_URL = "rediss://mock-redis:6380";

// Google OAuth — fake values so passport strategy initialises without errors
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
process.env.BACKEND_GOOGLE_CALLBACK_URL =
  "http://localhost:5000/api/auth/google/callback";

// Exchange rate service — missing URL/key causes it to use hardcoded fallback
// (no HTTP requests made in tests)
process.env.EXCHANGE_RATE_URL = "";
process.env.EXCHANGERATES_API_KEY = "";
