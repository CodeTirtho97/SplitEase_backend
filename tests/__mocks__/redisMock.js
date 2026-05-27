// Redis mock — replaces config/redis in all tests via moduleNameMapper.
// validateSession returns true so the auth middleware passes all valid JWTs.
// storeSession/deleteSession/publishEvent are no-ops that resolve immediately.

const redisMock = {
  redisClient: { isReady: false },
  connectRedis: jest.fn().mockResolvedValue(true),
  keepAlive: jest.fn().mockResolvedValue(true),
  shutdown: jest.fn(),

  // Cache middleware: always calls next() (no caching in tests)
  cacheMiddleware: () => (req, res, next) => next(),

  // Rate limiting: always passes (no throttling in tests)
  rateLimiter: () => (req, res, next) => next(),

  // Session management
  storeSession: jest.fn().mockResolvedValue(true),
  validateSession: jest.fn().mockResolvedValue(true),
  deleteSession: jest.fn().mockResolvedValue(true),

  // Cache helpers
  clearCache: jest.fn().mockResolvedValue(true),

  // Pub/Sub — no-ops so socket events don't fail
  publishEvent: jest.fn().mockResolvedValue(true),
  subscribeToChannel: jest.fn(),
};

module.exports = redisMock;
