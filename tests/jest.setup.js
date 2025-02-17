const mongoose = require("mongoose");

// 🚀 Run before all tests start
beforeAll(async () => {
  process.env.NODE_ENV = "test"; // Ensure tests use the right env
});

// 🚀 Close DB after all tests
afterAll(async () => {
  await mongoose.connection.close();
  console.log("✅ MongoDB connection closed after tests.");
});
