const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { subscribeToChannel, redisClient, KEY_PREFIX } = require("./redis");
const logger = require("../utils/logger");
require("dotenv").config();

// Store active connections
const activeConnections = new Map();
let io = null;

// Initialize Socket.io server
const initSocketServer = (server) => {
  io = new Server(server, {
    cors: {
      origin: [process.env.FRONTEND_URL, "http://localhost:3000"],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch (error) {
      logger.warn(`Socket auth failed: ${error.message}`);
      next(new Error("Authentication error: Invalid token"));
    }
  });

  // Connection event
  io.on("connection", (socket) => {
    const userId = socket.userId;
    logger.info(`Socket connected: ${userId}`);

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
      logger.info(`Socket: user ${userId} joined group ${groupId}`);
      socket.join(`group:${groupId}`);
    });

    socket.on("leave_group", (groupId) => {
      if (!groupId) return;
      logger.info(`Socket: user ${userId} left group ${groupId}`);
      socket.leave(`group:${groupId}`);
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      logger.info(`Socket disconnected: ${userId}`);
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

  logger.info("WebSocket server initialized");

  if (redisClient.isReady) {
    setupRedisSubscribers(io);
  } else {
    logger.warn("Redis not ready — will set up pub/sub subscribers when Redis connects");
    redisClient.on("ready", () => {
      logger.info("Redis ready — setting up pub/sub subscribers");
      setupRedisSubscribers(io);
    });
  }

  return io;
};

// Setup Redis subscribers to broadcast events to relevant Socket.io rooms
const setupRedisSubscribers = async (io) => {
  try {
    // Add retries for subscriptions
    const setupChannel = async (channelName, handler, retries = 3) => {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          logger.info(`Subscribing to ${channelName} (attempt ${attempt + 1}/${retries})`);
          await subscribeToChannel(channelName, handler);
          logger.info(`Subscribed to ${channelName}`);
          return true;
        } catch (error) {
          logger.error(`Failed to subscribe to ${channelName} (attempt ${attempt + 1}): ${error.message}`);
          if (attempt === retries - 1) throw error;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    };

    // Set up each channel with retry logic
    await setupChannel(`${KEY_PREFIX}expense_events`, (message) => {
      try {
        const data = JSON.parse(message);
        const { event, expense, groupId, affectedUsers } = data;
        if (groupId) {
          io.to(`group:${groupId}`).emit("expense_update", { event, expense });
        }
        if (Array.isArray(affectedUsers)) {
          affectedUsers.forEach((userId) => {
            io.to(`user:${userId}`).emit("expense_update", { event, expense });
          });
        }
      } catch (err) {
        logger.error(`Error handling expense_events message: ${err.message}`);
      }
    });

    await setupChannel(`${KEY_PREFIX}transaction_events`, (message) => {
      try {
        const data = JSON.parse(message);
        const { event, transaction, sender, receiver } = data;
        if (sender) {
          io.to(`user:${sender}`).emit("transaction_update", { event, transaction });
        }
        if (receiver) {
          io.to(`user:${receiver}`).emit("transaction_update", { event, transaction });
        }
      } catch (err) {
        logger.error(`Error handling transaction_events message: ${err.message}`);
      }
    });

    await setupChannel(`${KEY_PREFIX}group_events`, (message) => {
      try {
        const data = JSON.parse(message);
        const { event, group, affectedUsers } = data;
        if (group && group._id) {
          io.to(`group:${group._id}`).emit("group_update", { event, group });
        }
        if (Array.isArray(affectedUsers)) {
          affectedUsers.forEach((userId) => {
            io.to(`user:${userId}`).emit("group_update", { event, group });
          });
        }
      } catch (err) {
        logger.error(`Error handling group_events message: ${err.message}`);
      }
    });

    await setupChannel(`${KEY_PREFIX}notification_events`, (message) => {
      try {
        const data = JSON.parse(message);
        const { userId, notification } = data;
        if (userId) {
          io.to(`user:${userId}`).emit("notification", notification);
        }
      } catch (err) {
        logger.error(`Error handling notification_events message: ${err.message}`);
      }
    });

    logger.info("Redis pub/sub subscribers ready");
  } catch (error) {
    logger.error(`setupRedisSubscribers failed: ${error.message} — retrying in 5s`);
    setTimeout(() => setupRedisSubscribers(io), 5000);
  }
};

// Helper function to send notification to specific user
const sendUserNotification = (userId, notification) => {
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
