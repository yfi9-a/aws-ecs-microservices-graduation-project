const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// In production these resolve via Cloud Map DNS, e.g.:
//   http://auth.internal:3000
//   http://notifications.internal:3000
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const NOTIFICATIONS_SERVICE_URL = process.env.NOTIFICATIONS_SERVICE_URL || 'http://localhost:3002';

// In-memory order store — fine for a stateless-demo container;
// a real deployment would back this with a database.
const orders = [];

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

async function verifyToken(authHeader) {
  const resp = await fetch(`${AUTH_SERVICE_URL}/api/auth/verify`, {
    headers: { Authorization: authHeader || '' },
  });
  const body = await resp.json().catch(() => ({}));
  return { ok: resp.ok && body.valid === true, username: body.username };
}

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'orders' });
});

app.post('/api/orders', async (req, res) => {
  const { item, quantity } = req.body || {};
  if (!item || !quantity) {
    return res.status(400).json({ error: 'item and quantity are required' });
  }

  let auth;
  try {
    auth = await verifyToken(req.headers.authorization);
  } catch (err) {
    console.error('[orders] auth service unreachable:', err.message);
    return res.status(502).json({ error: 'auth service unavailable' });
  }
  if (!auth.ok) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const order = {
    id: crypto.randomUUID(),
    username: auth.username,
    item,
    quantity,
    status: 'created',
    createdAt: new Date().toISOString(),
  };
  orders.push(order);

  // Fire-and-log notification via Cloud Map service discovery.
  // Order creation succeeds even if the notification call fails.
  try {
    const notifyResp = await fetch(`${NOTIFICATIONS_SERVICE_URL}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'ORDER_CREATED',
        orderId: order.id,
        username: order.username,
        item: order.item,
        quantity: order.quantity,
      }),
    });
    if (!notifyResp.ok) {
      console.error(`[orders] notifications service returned ${notifyResp.status}`);
    }
  } catch (err) {
    console.error('[orders] failed to reach notifications service:', err.message);
  }

  return res.status(201).json(order);
});

app.get('/api/orders', async (req, res) => {
  let auth;
  try {
    auth = await verifyToken(req.headers.authorization);
  } catch (err) {
    console.error('[orders] auth service unreachable:', err.message);
    return res.status(502).json({ error: 'auth service unavailable' });
  }
  if (!auth.ok) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const userOrders = orders.filter((o) => o.username === auth.username);
  return res.status(200).json(userOrders);
});

app.listen(PORT, () => {
  console.log(`[orders] listening on port ${PORT}`);
  console.log(`[orders] auth service: ${AUTH_SERVICE_URL}`);
  console.log(`[orders] notifications service: ${NOTIFICATIONS_SERVICE_URL}`);
});
