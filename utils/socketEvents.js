const { publishEvent, KEY_PREFIX } = require("../config/redis");
const logger = require("./logger");

// Expense events
const publishExpenseEvent = async (event, expense, groupId, affectedUsers) => {
  try {
    await publishEvent(`${KEY_PREFIX}expense_events`, {
      event,
      expense,
      groupId,
      affectedUsers,
    });

    return true;
  } catch (error) {
    logger.error(`Error publishing expense event (${event}): ${error.message}`);
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
    await publishEvent(`${KEY_PREFIX}transaction_events`, {
      event,
      transaction,
      sender,
      receiver,
    });

    return true;
  } catch (error) {
    logger.error(`Error publishing transaction event (${event}): ${error.message}`);
    return false;
  }
};

// Group events
const publishGroupEvent = async (event, group, affectedUsers) => {
  try {
    await publishEvent(`${KEY_PREFIX}group_events`, {
      event,
      group,
      affectedUsers,
    });

    return true;
  } catch (error) {
    logger.error(`Error publishing group event (${event}): ${error.message}`);
    return false;
  }
};

// User notification events
const publishNotification = async (userId, notification) => {
  try {
    await publishEvent(`${KEY_PREFIX}notification_events`, {
      userId,
      notification,
    });

    return true;
  } catch (error) {
    logger.error(`Error publishing notification: ${error.message}`);
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
