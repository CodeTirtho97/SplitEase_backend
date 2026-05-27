const mongoose = require("mongoose");

// Ensure mongoose is connected to the in-memory server before each suite.
// server.js's async IIFE also calls connectDB(), but since MONGO_URI is already
// set to the in-memory URI by setEnvVars.js, both connect to the same instance.
beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI);
  }
});

// Clear all collections after each test FILE (not each test) so stateful
// sequences within a single describe block work correctly.
afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }
  }
});
