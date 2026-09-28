const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

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
  res.json({ status: 'UP', service: 'profile-management' });
});

// JWT signing key must come from the environment (K8s Secret in prod)
const secretKey = process.env.JWT_SECRET;
if (!secretKey) {
  console.error('JWT_SECRET environment variable is not set. Exiting.');
  process.exit(1);
}

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
};

const pool = mysql.createPool(dbConfig);

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, secretKey, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.userId = decoded.userId;
    next();
  });
};

// Sign up route
app.post('/api/signup', async (req, res) => {
  const { firstName, lastName, address, postalCode, email, password } = req.body;

  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Never store plaintext passwords
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const [result] = await pool.query(
      `INSERT INTO users (first_name, last_name, address, postal_code, email, password_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [firstName, lastName, address || '', postalCode || '', email, passwordHash]
    );

    res.status(201).json({ message: 'User registered successfully', userId: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    console.error('DB error signing up:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sign in route
app.post('/api/signin', async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await pool.query(
      `SELECT id, first_name AS firstName, last_name AS lastName,
              address, postal_code AS postalCode, email, password_hash
       FROM users WHERE email = ?`,
      [email]
    );
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, secretKey);

    // Never return the password hash to the client
    delete user.password_hash;

    res.json({ message: 'Login successful', token, user });
  } catch (err) {
    console.error('DB error signing in:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sign out route
app.post('/api/signout', authenticateToken, (req, res) => {
  // The user is already authenticated at this point
  // You can perform any necessary cleanup or invalidate the token if needed
  res.json({ message: 'Logout successful' });
});

// Protected route example
app.get('/api/protected', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, first_name AS firstName, last_name AS lastName,
              address, postal_code AS postalCode, email
       FROM users WHERE id = ?`,
      [req.userId]
    );
    res.json({ message: 'Protected route accessed successfully', user: rows[0] || null });
  } catch (err) {
    console.error('DB error fetching user:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user route
app.put('/api/update', authenticateToken, async (req, res) => {
  // Only allow updates to certain fields
  const { firstName, lastName, address, postalCode } = req.body;

  try {
    // COALESCE keeps the existing value when a field is not provided
    const [result] = await pool.query(
      `UPDATE users
       SET first_name  = COALESCE(?, first_name),
           last_name   = COALESCE(?, last_name),
           address     = COALESCE(?, address),
           postal_code = COALESCE(?, postal_code)
       WHERE id = ?`,
      [firstName || null, lastName || null, address || null, postalCode || null, req.userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [rows] = await pool.query(
      `SELECT id, first_name AS firstName, last_name AS lastName,
              address, postal_code AS postalCode, email
       FROM users WHERE id = ?`,
      [req.userId]
    );

    res.json({ message: 'User updated successfully', user: rows[0] });
  } catch (err) {
    console.error('DB error updating user:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
  
// Start the server
const port = process.env.PORT || 3003;
app.listen(port, () => {
  console.log(`Authentication API is running on port ${port}`);
  console.log(`Connected to MySQL at ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
});