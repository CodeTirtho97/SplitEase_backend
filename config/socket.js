const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { subscribeToChannel } = require("./redis");
require("dotenv").config();

// Store active connections
const activeConnections = new Map();

// Initialize Socket.io server
const initSocketServer = (server) => {
  const io = new Server(server, {
    cors: {
      origin: [process.env.FRONTEND_URL, "http://localhost:3000"],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    try {
      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch (error) {
      console.error("Socket authentication error:", error);
      next(new Error("Authentication error: Invalid token"));
    }
  });

  // Connection event
  io.on("connection", (socket) => {
    const userId = socket.userId;
    console.log(`🔌 User connected: ${userId}`);

    // Store user's socket connection
    if (!activeConnections.has(userId)) {
      activeConnections.set(userId, new Set());
    }
    activeConnections.get(userId).add(socket.id);

    // Send initial connection confirmation
    socket.emit("connection_success", {
      message: "Connected to SplitEase real-time service",
    });

    // Join user to their personal room
    socket.join(`user:${userId}`);

    // Handle join group room events
    socket.on("join_group", (groupId) => {
      if (!groupId) return;
      console.log(`User ${userId} joined group ${groupId}`);
      socket.join(`group:${groupId}`);
    });

    // Handle leave group room events
    socket.on("leave_group", (groupId) => {
      if (!groupId) return;
      console.log(`User ${userId} left group ${groupId}`);
      socket.leave(`group:${groupId}`);
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log(`🔌 User disconnected: ${userId}`);
      // Remove socket from user's connections
      if (activeConnections.has(userId)) {
        activeConnections.get(userId).delete(socket.id);
        // If no active connections remain, delete the user entry
        if (activeConnections.get(userId).size === 0) {
          activeConnections.delete(userId);
        }
      }
    });
  });

  console.log("🔌 WebSocket server initialized");

  // Connect Socket.io with Redis Pub/Sub for event broadcasting
  setupRedisSubscribers(io);

  return io;
};

// Setup Redis subscribers to broadcast events to relevant Socket.io rooms
const setupRedisSubscribers = (io) => {
  // Expense created/updated event
  subscribeToChannel("expense_events", (message) => {
    const { event, expense, groupId, affectedUsers } = message;

    // Emit to group room
    if (groupId) {
      io.to(`group:${groupId}`).emit("expense_update", { event, expense });
    }

    // Emit to individual user rooms
    if (affectedUsers && Array.isArray(affectedUsers)) {
      affectedUsers.forEach((userId) => {
        io.to(`user:${userId}`).emit("expense_update", { event, expense });
      });
    }
  });

  // Transaction status event
  subscribeToChannel("transaction_events", (message) => {
    const { event, transaction, sender, receiver } = message;

    // Notify sender
    io.to(`user:${sender}`).emit("transaction_update", { event, transaction });

    // Notify receiver
    io.to(`user:${receiver}`).emit("transaction_update", {
      event,
      transaction,
    });
  });

  // Group update event
  subscribeToChannel("group_events", (message) => {
    const { event, group, affectedUsers } = message;

    // Emit to group room
    io.to(`group:${group._id}`).emit("group_update", { event, group });

    // Emit to individual user rooms
    if (affectedUsers && Array.isArray(affectedUsers)) {
      affectedUsers.forEach((userId) => {
        io.to(`user:${userId}`).emit("group_update", { event, group });
      });
    }
  });

  // User notification event
  subscribeToChannel("notification_events", (message) => {
    const { userId, notification } = message;

    // Emit to user's room
    io.to(`user:${userId}`).emit("notification", notification);
  });

  console.log("✅ Redis subscribers configured for WebSocket events");
};

// Helper function to send notification to specific user
const sendUserNotification = async (userId, notification) => {
  if (!io) return false;

  io.to(`user:${userId}`).emit("notification", notification);
  return true;
};

// Helper function to broadcast to all connected clients
const broadcastToAll = (event, data) => {
  if (!io) return false;

  io.emit(event, data);
  return true;
};

// Export functions
module.exports = {
  initSocketServer,
  sendUserNotification,
  broadcastToAll,
  activeConnections,
};
