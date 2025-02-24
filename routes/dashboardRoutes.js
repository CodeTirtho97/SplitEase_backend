const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware"); // Ensure correct destructuring
const {
  getDashboardStats,
  getRecentTransactions,
} = require("../services/dashboardService");

//console.log("Dashboard Routes Loaded", {
//   getDashboardStats,
//   getRecentTransactions,
// }); // Debug log

// Ensure functions are defined at runtime before defining routes
if (
  !getDashboardStats ||
  !getRecentTransactions ||
  typeof getDashboardStats !== "function" ||
  typeof getRecentTransactions !== "function"
) {
  console.error("Dashboard functions are undefined or not functions:", {
    getDashboardStats,
    getRecentTransactions,
  });
  throw new Error("Dashboard service functions not loaded or invalid");
}

router.get("/stats", protect, async (req, res) => {
  //   console.log(
  //     "Processing /stats route for userId:",
  //     req.user?._id,
  //     typeof req.user?._id
  //   ); // Debug log
  try {
    const stats = await getDashboardStats(req.user._id);
    //console.log("Stats response prepared:", stats); // Debug log
    res.status(200).json(stats);
  } catch (error) {
    console.error("Error in /stats route:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.get("/transactions/recent", protect, async (req, res) => {
  //   console.log(
  //     "Processing /transactions/recent route for userId:",
  //     req.user?._id,
  //     typeof req.user?._id
  //   ); // Debug log
  try {
    const transactions = await getRecentTransactions(req.user._id);
    //console.log("Transactions response prepared:", transactions); // Debug log
    res.status(200).json({ transactions });
  } catch (error) {
    //console.error("Error in /transactions/recent route:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
