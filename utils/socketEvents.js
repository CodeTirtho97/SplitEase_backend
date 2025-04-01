const { publishEvent } = require("../config/redis");

// Expense events
const publishExpenseEvent = async (event, expense, groupId, affectedUsers) => {
  try {
    await publishEvent("expense_events", {
      event,
      expense,
      groupId,
      affectedUsers,
    });

    return true;
  } catch (error) {
    console.error(`Error publishing expense event (${event}):`, error);
    return false;
  }
};

// Transaction events
const publishTransactionEvent = async (
  event,
  transaction,
  sender,
  receiver
) => {
  try {
    await publishEvent("transaction_events", {
      event,
      transaction,
      sender,
      receiver,
    });

    return true;
  } catch (error) {
    console.error(`Error publishing transaction event (${event}):`, error);
    return false;
  }
};

// Group events
const publishGroupEvent = async (event, group, affectedUsers) => {
  try {
    await publishEvent("group_events", {
      event,
      group,
      affectedUsers,
    });

    return true;
  } catch (error) {
    console.error(`Error publishing group event (${event}):`, error);
    return false;
  }
};

// User notification events
const publishNotification = async (userId, notification) => {
  try {
    await publishEvent("notification_events", {
      userId,
      notification,
    });

    return true;
  } catch (error) {
    console.error("Error publishing notification:", error);
    return false;
  }
};

// Create a standardized notification
const createNotification = (type, title, message, data = {}) => {
  return {
    id: Date.now().toString(),
    type,
    title,
    message,
    data,
    timestamp: new Date().toISOString(),
    read: false,
  };
};

module.exports = {
  publishExpenseEvent,
  publishTransactionEvent,
  publishGroupEvent,
  publishNotification,
  createNotification,
};
