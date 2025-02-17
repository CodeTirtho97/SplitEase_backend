const request = require("supertest");
const { app, server } = require("../server"); // Import the server
const path = require("path");

let testToken = ""; // Store the token for authentication
let testUserId = ""; // Store user ID for friend addition

// ✅ Login and get token before running tests
beforeAll(async () => {
  const res = await request(app).post("/api/auth/login").send({
    email: "testuser@example.com",
    password: "Test@1234",
  });

  expect(res.statusCode).toBe(200); // Ensure login was successful
  testToken = res.body.token;
  testUserId = res.body.userId;

  if (!testToken) {
    throw new Error("🚨 Authentication failed: No token received!");
  }
});

// 1️⃣ **Upload Profile Picture**
test("Upload Profile Picture", async () => {
  const res = await request(app)
    .post("/api/profile/upload")
    .set("Authorization", `Bearer ${testToken}`)
    .attach("profilePic", path.join(__dirname, "test_files/sample.jpg"));

  expect(res.statusCode).toBe(200);
  expect(res.body).toHaveProperty(
    "message",
    "Profile picture updated successfully"
  );
  expect(res.body).toHaveProperty("profilePic");
});

// 2️⃣ **Fetch User Profile**
test("Fetch User Profile", async () => {
  const res = await request(app)
    .get("/api/profile/me")
    .set("Authorization", `Bearer ${testToken}`);

  expect(res.statusCode).toBe(200);
  expect(res.body).toHaveProperty("fullName");
  expect(res.body).toHaveProperty("email");
  expect(res.body).toHaveProperty("profilePic");
});

// 3️⃣ **Add a Friend by User ID**
test("Add a Friend", async () => {
  const res = await request(app)
    .post("/api/profile/add-friend")
    .set("Authorization", `Bearer ${testToken}`)
    .send({ friendId: "67b3302cc6907bd1d8d071d6" }); // Ensure this user exists in DB

  expect(res.statusCode).toBe(200);
  expect(res.body).toHaveProperty("message", "Friend added successfully");
  expect(res.body).toHaveProperty("friends");
});

// 4️⃣ **Check for Invalid Friend ID**
test("Fail to Add an Invalid Friend", async () => {
  const res = await request(app)
    .post("/api/profile/add-friend")
    .set("Authorization", `Bearer ${testToken}`)
    .send({ friendId: "invalidUserId123" });

  expect(res.statusCode).toBe(400);
  expect(res.body).toHaveProperty(
    "message",
    "Invalid user ID format. Must be a 24-character hex string."
  );
});

// 5️⃣ **Check for Duplicate Friend Entry**
test("Fail to Add a Duplicate Friend", async () => {
  const res = await request(app)
    .post("/api/profile/add-friend")
    .set("Authorization", `Bearer ${testToken}`)
    .send({ friendId: "67b3302cc6907bd1d8d071d6" }); // Replace with same user ID as before

  expect(res.statusCode).toBe(400);
  expect(res.body).toHaveProperty("message", "User is already your friend");
});

// 6️⃣ **Add a Payment Method**
test("Add a Payment Method", async () => {
  const res = await request(app)
    .post("/api/profile/add-payment")
    .set("Authorization", `Bearer ${testToken}`)
    .send({ methodType: "UPI", accountDetails: "user@upi" });

  expect(res.statusCode).toBe(200);
  expect(res.body).toHaveProperty("paymentMethods");
});

// 7️⃣ **Check for Duplicate Payment Method**
test("Fail to Add Duplicate Payment Method", async () => {
  const res = await request(app)
    .post("/api/profile/add-payment")
    .set("Authorization", `Bearer ${testToken}`)
    .send({ methodType: "UPI", accountDetails: "user@upi" });

  expect(res.statusCode).toBe(400);
  expect(res.body).toHaveProperty(
    "message",
    "This payment method is already added."
  );
});

// ✅ **Cleanup after tests (if necessary)**
afterAll(async () => {
  await server.close(); // Close Express Server
});
