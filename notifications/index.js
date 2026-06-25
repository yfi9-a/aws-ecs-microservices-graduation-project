const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MAX_NOTIFICATIONS = 50;

// In-memory store — fine for demo; a real deployment might push to
// SNS/SQS/email instead of just storing in process memory.
const notifications = [];

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'notifications' });
});

// Internal only — called directly by the orders service via Cloud Map DNS,
// never goes through the ALB.
app.post('/notify', (req, res) => {
  const { type, orderId, username, item, quantity } = req.body || {};
  if (!type || !orderId) {
    return res.status(400).json({ error: 'type and orderId are required' });
  }

  const notification = {
    id: crypto.randomUUID(),
    type,
    orderId,
    username,
    item,
    quantity,
    receivedAt: new Date().toISOString(),
  };

  notifications.unshift(notification);
  if (notifications.length > MAX_NOTIFICATIONS) {
    notifications.length = MAX_NOTIFICATIONS;
  }

  console.log(`[notifications] ${type} for order ${orderId} (user: ${username})`);
  return res.status(201).json(notification);
});

// External — fronted by the ALB at /api/notifications for the demo frontend.
app.get('/api/notifications', (req, res) => {
  res.status(200).json(notifications);
});

app.listen(PORT, () => {
  console.log(`[notifications] listening on port ${PORT}`);
});
