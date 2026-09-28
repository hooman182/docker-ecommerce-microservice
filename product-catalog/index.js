const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2/promise');
let Redis;
try { Redis = require('ioredis'); } catch (_) { /* optional dependency */ }

const app = express();
app.use(bodyParser.json());
// CORS: allowlist via env (comma-separated origins); "*" keeps demo behavior
const allowedOrigins = (process.env.CORS_ORIGINS || '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Origin not allowed by CORS')); 
    },
  })
);

// Health check for K8s probes / ELB (guide §5.1, §5.2)
app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'product-catalog' });
});

// ------------------------------------------------------------
// Database configuration (env-driven: RDS in prod, compose in dev)
// ------------------------------------------------------------
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'ecommerce_user',
  password: process.env.DB_PASSWORD || 'ecommerce_pass',
  database: process.env.DB_NAME || 'ecommerce',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_POOL_SIZE || '10', 10),
  // Return DECIMAL columns as JS numbers (price must stay numeric for the UI)
  decimalNumbers: true,
};

const pool = mysql.createPool(dbConfig);

// ------------------------------------------------------------
// Redis (DCS) read-through cache - optional, degrades to DB on failure
// ------------------------------------------------------------
const REDIS_URL = process.env.REDIS_URL;
const REDIS_TTL = parseInt(process.env.REDIS_TTL_SECONDS || '300', 10);
const redis = Redis && REDIS_URL ? new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 }) : null;
if (redis) {
  redis.connect().catch((e) => console.error('Redis connect failed (serving from DB):', e.message));
  redis.on('error', (e) => console.error('Redis error:', e.message));
}

const cacheGet = async (key) => {
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
};

const cacheSet = async (key, value) => {
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', REDIS_TTL);
  } catch (_) {
    /* cache write failures never break the request */
  }
};

// ------------------------------------------------------------
// Endpoints (same API contract as before)
// ------------------------------------------------------------
app.get('/api/products', async (req, res) => {
  const cached = await cacheGet('products:all');
  if (cached) {
    return res.json(cached);
  }
  try {
    const [rows] = await pool.query(
      'SELECT id, name, description, price, category FROM products ORDER BY id'
    );
    await cacheSet('products:all', rows);
    res.json(rows);
  } catch (err) {
    console.error('DB error listing products:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    const [rows] = await pool.query(
      'SELECT id, name, description, price, category FROM products WHERE id = ?',
      [productId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('DB error fetching product:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Product Catalog microservice is running on port ${port}`);
  console.log(`Connected to MySQL at ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
  console.log(`Redis cache: ${redis ? REDIS_URL : 'disabled'}`);
});