const request = require("supertest");
const { app } = require("../server");

let testToken = "";

describe("Authentication API", () => {
  test("POST /api/auth/signup — creates new user and returns token", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      fullName: "Test User",
      email: "testuser@example.com",
      gender: "Male",
      password: "Test@1234",
      confirmPassword: "Test@1234",
    });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty("token");
    testToken = res.body.token;
  });

  test("POST /api/auth/signup — rejects duplicate email", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      fullName: "Test User",
      email: "testuser@example.com",
      gender: "Male",
      password: "Test@1234",
      confirmPassword: "Test@1234",
    });

    expect(res.statusCode).toBe(400);
  });

  test("POST /api/auth/login — returns token for valid credentials", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "testuser@example.com",
      password: "Test@1234",
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("token");
    testToken = res.body.token;
  });

  test("POST /api/auth/login — rejects wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "testuser@example.com",
      password: "WrongPassword",
    });

    expect(res.statusCode).toBe(401);
  });

  test("GET /api/auth/google/login — redirects to Google OAuth", async () => {
    const res = await request(app).get("/api/auth/google/login");
    expect(res.statusCode).toBe(302);
  });

  test("GET /api/auth/protected — allows access with valid token", async () => {
    const res = await request(app)
      .get("/api/auth/protected")
      .set("Authorization", `Bearer ${testToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("message", "Access granted");
  });

  test("GET /api/auth/protected — rejects invalid token", async () => {
    const res = await request(app)
      .get("/api/auth/protected")
      .set("Authorization", "Bearer invalid_token_here");

    expect(res.statusCode).toBe(401);
  });

  test("GET /api/auth/protected — rejects missing token", async () => {
    const res = await request(app).get("/api/auth/protected");
    expect(res.statusCode).toBe(401);
  });
});
