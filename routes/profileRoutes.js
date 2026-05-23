const express = require("express");
const {
  uploadProfilePicture,
  getUserProfile,
  addFriend,
  addPaymentMethod,
  updateProfile,
  changePassword,
  searchFriends,
  deleteFriend,
  deletePayment,
} = require("../services/profileService");
const protect = require("../middleware/authMiddleware");
const upload = require("../middleware/multer");

const router = express.Router();

/**
 * @swagger
 * /api/profile/me:
 *   get:
 *     summary: Get the authenticated user's profile
 *     description: >
 *       Returns the full profile of the currently logged-in user, including
 *       their friends list (populated with name and email) and saved payment
 *       methods. Password field is excluded from the response.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Profile fetched successfully
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get("/me", protect, getUserProfile);

/**
 * @swagger
 * /api/profile/update:
 *   put:
 *     summary: Update profile name and gender
 *     description: >
 *       Updates the `fullName` and/or `gender` fields of the authenticated
 *       user's profile. Profile picture changes require the separate `/upload`
 *       endpoint.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 maxLength: 30
 *                 example: Tirthoraj B.
 *               gender:
 *                 type: string
 *                 enum: [Male, Female, Other]
 *                 example: Male
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 */
router.put("/update", protect, updateProfile);

/**
 * @swagger
 * /api/profile/upload:
 *   post:
 *     summary: Upload or replace profile picture
 *     description: >
 *       Accepts a JPEG or PNG image (max **100 KB**) via `multipart/form-data`.
 *       The image is transformed to a 150×150 crop and stored in Cloudinary
 *       under the `profile_pics` folder. Any previously stored image for the
 *       user is deleted from Cloudinary before the new one is saved.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [profilePic]
 *             properties:
 *               profilePic:
 *                 type: string
 *                 format: binary
 *                 description: Image file (JPG/JPEG/PNG, max 100 KB)
 *     responses:
 *       200:
 *         description: Profile picture updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Profile picture updated successfully
 *                 profilePic:
 *                   type: string
 *                   example: https://res.cloudinary.com/demo/image/upload/profile_pics/abc.jpg
 *       400:
 *         description: Invalid file type or file too large
 *       401:
 *         description: Unauthorized
 */
router.post("/upload", protect, upload.single("profilePic"), uploadProfilePicture);

/**
 * @swagger
 * /api/profile/change-password:
 *   put:
 *     summary: Change account password
 *     description: >
 *       Verifies the current password before applying the change.
 *       The new password is rejected if it is identical to the old one.
 *       Hashed with bcrypt (12 salt rounds) before storage.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword]
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 format: password
 *                 example: OldPass@123
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 example: NewPass@456
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Old password incorrect, or new password same as old
 *       401:
 *         description: Unauthorized
 */
router.put("/change-password", protect, changePassword);

/**
 * @swagger
 * /api/profile/add-friend:
 *   post:
 *     summary: Add a user as a friend
 *     description: >
 *       Adds another registered user to the authenticated user's friends list.
 *       Friends must be added before they can be included in a group.
 *       Prevents duplicate entries.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [friendId]
 *             properties:
 *               friendId:
 *                 type: string
 *                 description: MongoDB ObjectId of the user to add
 *                 example: 64b1f2c8e4b0a12345678902
 *     responses:
 *       200:
 *         description: Friend added successfully
 *       400:
 *         description: Already friends or invalid ID
 *       404:
 *         description: User not found
 *       401:
 *         description: Unauthorized
 */
router.post("/add-friend", protect, addFriend);

/**
 * @swagger
 * /api/profile/search-friends:
 *   post:
 *     summary: Search for users by name or email
 *     description: >
 *       Performs a case-insensitive regex search across `fullName` and `email`
 *       fields. Returns up to 10 matching users. Used to find people before
 *       sending a friend request.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [query]
 *             properties:
 *               query:
 *                 type: string
 *                 description: Search term (name or email fragment)
 *                 example: tirthoraj
 *     responses:
 *       200:
 *         description: Search results returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/UserRef'
 *       401:
 *         description: Unauthorized
 */
router.post("/search-friends", protect, searchFriends);

/**
 * @swagger
 * /api/profile/add-payment:
 *   post:
 *     summary: Add a payment method to the profile
 *     description: >
 *       Saves a new payment method (UPI ID, PayPal email, or Stripe account)
 *       to the user's profile. Multiple methods of the same type can coexist.
 *       These are used as presets when settling transactions.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [methodType, accountDetails]
 *             properties:
 *               methodType:
 *                 type: string
 *                 enum: [UPI, PayPal, Stripe]
 *                 example: UPI
 *               accountDetails:
 *                 type: string
 *                 description: UPI handle, PayPal email, or Stripe account ID
 *                 example: user@upi
 *     responses:
 *       200:
 *         description: Payment method added
 *       400:
 *         description: Invalid method type or duplicate entry
 *       401:
 *         description: Unauthorized
 */
router.post("/add-payment", protect, addPaymentMethod);

/**
 * @swagger
 * /api/profile/delete-friend/{friendId}:
 *   delete:
 *     summary: Remove a friend from the friends list
 *     description: >
 *       Removes the specified user from the authenticated user's `friends`
 *       array. Note: this does not remove the friend from any existing groups.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: friendId
 *         required: true
 *         schema:
 *           type: string
 *         example: 64b1f2c8e4b0a12345678902
 *     responses:
 *       200:
 *         description: Friend removed successfully
 *       404:
 *         description: Friend not found in list
 *       401:
 *         description: Unauthorized
 */
router.delete("/delete-friend/:friendId", protect, deleteFriend);

/**
 * @swagger
 * /api/profile/delete-payment/{paymentId}:
 *   delete:
 *     summary: Remove a saved payment method
 *     description: Deletes the specified payment method from the user's profile by its subdocument ID.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB subdocument _id of the payment method
 *         example: 64b1f2c8e4b0a12345678905
 *     responses:
 *       200:
 *         description: Payment method removed successfully
 *       404:
 *         description: Payment method not found
 *       401:
 *         description: Unauthorized
 */
router.delete("/delete-payment/:paymentId", protect, deletePayment);

module.exports = router;
