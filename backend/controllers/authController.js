const { pool } = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "rfq_system_jwt_secret_key";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

// ─── Ensure users table exists ────────────────────────────────────────────────
const ensureUsersTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      name       VARCHAR(100) NOT NULL,
      email      VARCHAR(255) NOT NULL UNIQUE,
      password   VARCHAR(255) NOT NULL,
      role       VARCHAR(20)  NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
      is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);

  // Seed a default admin if no users exist yet
  const { rows } = await pool.query("SELECT COUNT(*) FROM users");
  if (parseInt(rows[0].count, 10) === 0) {
    const hashed = await bcrypt.hash("admin123", 10);
    await pool.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, $4)`,
      ["Admin", "admin@rfq.com", hashed, "admin"]
    );
    console.log("✅ Default admin seeded → admin@rfq.com / admin123");
  }
};
ensureUsersTable().catch(console.error);

// ─── POST /api/auth/login ──────────────────────────────────────────────────────
const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, message: "Email and password required." });

  try {
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND is_active = TRUE",
      [email.toLowerCase().trim()]
    );
    const user = rows[0];
    if (!user)
      return res.status(401).json({ success: false, message: "Invalid email or password." });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ success: false, message: "Invalid email or password." });

    const payload = { id: user.id, email: user.email, role: user.role, name: user.name };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error during login." });
  }
};

// ─── GET /api/auth/me ──────────────────────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, email, role, created_at FROM users WHERE id = $1",
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: "User not found." });
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
};

// ─── GET /api/users  (admin only) ─────────────────────────────────────────────
const getAllUsers = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC"
    );
    res.json({ success: true, users: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch users." });
  }
};

// ─── POST /api/users  (admin only) ────────────────────────────────────────────
const createUser = async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role)
    return res.status(400).json({ success: false, message: "All fields are required." });

  if (!["admin", "user"].includes(role))
    return res.status(400).json({ success: false, message: "Role must be 'admin' or 'user'." });

  try {
    // Check duplicate
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
      email.toLowerCase().trim(),
    ]);
    if (existing.rows.length > 0)
      return res.status(409).json({ success: false, message: "Email already in use." });

    const hashed = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, is_active, created_at`,
      [name.trim(), email.toLowerCase().trim(), hashed, role]
    );
    res.status(201).json({ success: true, user: rows[0] });
  } catch (err) {
    console.error("Create user error:", err);
    res.status(500).json({ success: false, message: "Failed to create user." });
  }
};

// ─── PUT /api/users/:id  (admin only) ─────────────────────────────────────────
const updateUser = async (req, res) => {
  const { id } = req.params;
  const { name, email, password, role, is_active } = req.body;

  try {
    // Build dynamic update
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined)      { fields.push(`name = $${idx++}`);      values.push(name.trim()); }
    if (email !== undefined)     { fields.push(`email = $${idx++}`);     values.push(email.toLowerCase().trim()); }
    if (role !== undefined)      { fields.push(`role = $${idx++}`);      values.push(role); }
    if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }
    if (password)                {
      const hashed = await bcrypt.hash(password, 10);
      fields.push(`password = $${idx++}`);
      values.push(hashed);
    }

    if (fields.length === 0)
      return res.status(400).json({ success: false, message: "Nothing to update." });

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await pool.query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx}
       RETURNING id, name, email, role, is_active, created_at`,
      values
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: "User not found." });
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    console.error("Update user error:", err);
    res.status(500).json({ success: false, message: "Failed to update user." });
  }
};

// ─── DELETE /api/users/:id  (admin only) ──────────────────────────────────────
const deleteUser = async (req, res) => {
  const { id } = req.params;

  // Prevent self-deletion
  if (parseInt(id, 10) === req.user.id)
    return res.status(400).json({ success: false, message: "You cannot delete your own account." });

  try {
    const { rowCount } = await pool.query("DELETE FROM users WHERE id = $1", [id]);
    if (rowCount === 0) return res.status(404).json({ success: false, message: "User not found." });
    res.json({ success: true, message: "User deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to delete user." });
  }
};

module.exports = { login, getMe, getAllUsers, createUser, updateUser, deleteUser };
