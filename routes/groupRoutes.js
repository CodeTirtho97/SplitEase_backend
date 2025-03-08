// /routes/groupRoutes.js
const express = require("express");
const router = express.Router();
const groupController = require("../controllers/groupController");
const authMiddleware = require("../middleware/auth");

// Apply authentication middleware to all group routes
router.use(authMiddleware);

// Group CRUD operations
router.post("/", groupController.createGroup);
router.get("/", groupController.getAllGroups);
router.get("/:id", groupController.getGroupById);
router.put("/:id", groupController.updateGroup);
router.delete("/:id", groupController.deleteGroup);

// Enhanced operations
router.post("/batch", groupController.getGroupsByIds);
router.put("/:id/archive", groupController.archiveGroup);
router.put("/:id/favorite", groupController.toggleFavorite);
router.get("/:id/stats", groupController.getGroupStats);
router.get("/:id/transactions", groupController.getGroupTransactions);
router.get("/:id/owes", groupController.calculateOwes);

module.exports = router;
