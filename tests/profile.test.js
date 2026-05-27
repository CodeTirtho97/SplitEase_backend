const request = require("supertest");
const { app } = require("../server");
const User = require("../models/User");

let testToken = "";
let secondUserId = "";

beforeAll(async () => {
  // Create the primary test user and log in
  await request(app).post("/api/auth/signup").send({
    fullName: "Profile User",
    email: "profileuser@example.com",
    gender: "Female",
    password: "Test@1234",
    confirmPassword: "Test@1234",
  });

  const loginRes = await request(app).post("/api/auth/login").send({
    email: "profileuser@example.com",
    password: "Test@1234",
  });
  expect(loginRes.statusCode).toBe(200);
  testToken = loginRes.body.token;

  // Create a second user to use as a friend target
  const secondUser = await User.create({
    fullName: "Second User",
    email: "second@example.com",
    gender: "Male",
    password: "Test@1234",
  });
  secondUserId = secondUser._id.toString();
});

test("GET /api/profile/me — returns the authenticated user's profile", async () => {
  const res = await request(app)
    .get("/api/profile/me")
    .set("Authorization", `Bearer ${testToken}`);

  expect(res.statusCode).toBe(200);
  expect(res.body).toHaveProperty("fullName", "Profile User");
  expect(res.body).toHaveProperty("email", "profileuser@example.com");
});

test("POST /api/profile/add-friend — adds a valid friend", async () => {
  const res = await request(app)
    .post("/api/profile/add-friend")
    .set("Authorization", `Bearer ${testToken}`)
    .send({ friendId: secondUserId });

  expect(res.statusCode).toBe(200);
  expect(res.body).toHaveProperty("message", "Friend added successfully!");
  expect(res.body).toHaveProperty("friendId", secondUserId);
});

test("POST /api/profile/add-friend — rejects duplicate friend", async () => {
  const res = await request(app)
    .post("/api/profile/add-friend")
    .set("Authorization", `Bearer ${testToken}`)
    .send({ friendId: secondUserId });

  expect(res.statusCode).toBe(400);
  expect(res.body).toHaveProperty("message", "Friend already added!");
});

test("POST /api/profile/add-friend — rejects invalid user ID format", async () => {
  const res = await request(app)
    .post("/api/profile/add-friend")
    .set("Authorization", `Bearer ${testToken}`)
    .send({ friendId: "not-a-valid-id" });

  expect(res.statusCode).toBe(400);
});

test("POST /api/profile/add-payment — adds a payment method", async () => {
  const res = await request(app)
    .post("/api/profile/add-payment")
    .set("Authorization", `Bearer ${testToken}`)
    .send({ methodType: "UPI", accountDetails: "profileuser@upi" });

  expect(res.statusCode).toBe(200);
  expect(res.body).toHaveProperty("paymentMethods");
});

test("POST /api/profile/add-payment — rejects duplicate payment method", async () => {
  const res = await request(app)
    .post("/api/profile/add-payment")
    .set("Authorization", `Bearer ${testToken}`)
    .send({ methodType: "UPI", accountDetails: "profileuser@upi" });

  expect(res.statusCode).toBe(400);
  expect(res.body).toHaveProperty("message", "This payment method is already added.");
});
