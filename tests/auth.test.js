const request = require("supertest");
const { app, server } = require("../server");

let testToken = "";

describe("🔐 Authentication API Tests", () => {
  test("Sign Up a new user", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      fullName: "Test User",
      email: "testuser@example.com",
      gender: "Male",
      password: "Test@1234",
    });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty("token");
    testToken = res.body.token;
  });

  test("Login user", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "testuser@example.com",
      password: "Test@1234",
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("token");
  });

  test("Access Google OAuth", async () => {
    const res = await request(app).get("/api/auth/google/signup");
    expect(res.statusCode).toBe(302);
  });

  // ✅ Protected Route Access
  test("Access protected route with valid token", async () => {
    const res = await request(app)
      .get("/api/auth/protected")
      .set("Authorization", `Bearer ${testToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("message", "Access granted");
  });

  test("Access protected route with invalid token", async () => {
    const res = await request(app)
      .get("/api/auth/protected")
      .set("Authorization", "Bearer invalid_token");

    expect(res.statusCode).toBe(401);
  });
});

// ✅ Close server after tests
afterAll(async () => {
  await server.close();
});
