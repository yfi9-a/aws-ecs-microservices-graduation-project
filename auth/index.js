const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Redis = require('ioredis');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const SESSION_TTL_SECONDS = parseInt(process.env.SESSION_TTL_SECONDS || '3600', 10);
const USERS_KEY = 'users'; // Redis hash: field = username, value = JSON {salt, hash}

const redis = new Redis({
  host: REDIS_HOST,
  port: Number(REDIS_PORT),
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

redis.on('error', (err) => console.error('[auth] redis error:', err.message));
redis.on('connect', () => console.log(`[auth] connected to redis at ${REDIS_HOST}:${REDIS_PORT}`));

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

async function createUser(username, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  await redis.hset(USERS_KEY, username, JSON.stringify({ salt, hash }));
}

async function findUser(username) {
  const raw = await redis.hget(USERS_KEY, username);
  return raw ? JSON.parse(raw) : null;
}

function verifyPassword(password, record) {
  const candidate = hashPassword(password, record.salt);
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(record.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Seed two demo accounts on first boot so the app is usable out of the box.
// Real users created via /api/auth/register live alongside these in Redis.
async function seedDemoUsers() {
  const demo = [
    { username: 'demo', password: 'demo123' },
    { username: 'admin', password: 'admin123' },
  ];
  for (const u of demo) {
    const exists = await redis.hexists(USERS_KEY, u.username);
    if (!exists) {
      await createUser(u.username, u.password);
      console.log(`[auth] seeded demo user: ${u.username}`);
    }
  }
}

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'auth' });
});

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  if (username.length < 3 || password.length < 6) {
    return res.status(400).json({ error: 'username must be 3+ chars, password 6+ chars' });
  }

  try {
    const exists = await redis.hexists(USERS_KEY, username);
    if (exists) {
      return res.status(409).json({ error: 'username already taken' });
    }
    await createUser(username, password);
    return res.status(201).json({ username });
  } catch (err) {
    console.error('[auth] register failed:', err.message);
    return res.status(500).json({ error: 'user store unavailable' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  let record;
  try {
    record = await findUser(username);
  } catch (err) {
    console.error('[auth] user lookup failed:', err.message);
    return res.status(500).json({ error: 'user store unavailable' });
  }

  if (!record || !verifyPassword(password, record)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }

  const token = jwt.sign({ sub: username }, JWT_SECRET, { expiresIn: '1h' });

  try {
    await redis.set(
      `session:${token}`,
      JSON.stringify({ username, loginAt: new Date().toISOString() }),
      'EX',
      SESSION_TTL_SECONDS
    );
  } catch (err) {
    console.error('[auth] failed to write session to redis:', err.message);
    return res.status(500).json({ error: 'session store unavailable' });
  }

  return res.status(200).json({ token, username, expiresIn: SESSION_TTL_SECONDS });
});

app.get('/api/auth/verify', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ valid: false, error: 'missing bearer token' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ valid: false, error: 'invalid or expired token' });
  }

  try {
    const session = await redis.get(`session:${token}`);
    if (!session) {
      return res.status(401).json({ valid: false, error: 'session not found' });
    }
    return res.status(200).json({ valid: true, username: decoded.sub });
  } catch (err) {
    console.error('[auth] redis lookup failed:', err.message);
    return res.status(500).json({ valid: false, error: 'session store unavailable' });
  }
});

app.listen(PORT, async () => {
  console.log(`[auth] listening on port ${PORT}`);
  try {
    await seedDemoUsers();
  } catch (err) {
    console.error('[auth] failed to seed demo users:', err.message);
  }
});
