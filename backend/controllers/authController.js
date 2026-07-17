const { pool } = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const JWT_SECRET = process.env.JWT_SECRET || "rfq_system_jwt_secret_key";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ─── Seed default admin on startup ───────────────────────────────────────────
const seedAdmin = async () => {
  try {
    const { rows } = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'admin'");
    if (parseInt(rows[0].count, 10) === 0) {
      const hashed = await bcrypt.hash("admin123", 10);
      await pool.query(
        `INSERT INTO users (name, email, password, role, auth_provider)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO NOTHING`,
        ["Admin", "admin@rfq.com", hashed, "admin", "local"]
      );
      console.log("✅ Default admin seeded → admin@rfq.com / admin123");
    }
  } catch (err) {
    console.error("Admin seed error:", err.message);
  }
};
seedAdmin();

// ─── Helper: generate JWT ────────────────────────────────────────────────────
const generateToken = (user) => {
  const payload = { id: user.id, email: user.email, role: user.role, name: user.name };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

// ─── POST /api/auth/register (public — users only) ──────────────────────────
const register = async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ success: false, message: "Name, email, and password are required." });

  if (password.length < 6)
    return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });

  try {
    // Check if email already exists
    const existing = await pool.query("SELECT id, auth_provider FROM users WHERE email = $1", [
      email.toLowerCase().trim(),
    ]);
    if (existing.rows.length > 0) {
      const provider = existing.rows[0].auth_provider;
      if (provider === "google") {
        return res.status(409).json({
          success: false,
          message: "This email is registered via Google. Please use Google Sign-In.",
        });
      }
      return res.status(409).json({ success: false, message: "Email already in use." });
    }

    const hashed = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password, role, auth_provider)
       VALUES ($1, $2, $3, 'user', 'local')
       RETURNING id, name, email, role, avatar_url, created_at`,
      [name.trim(), email.toLowerCase().trim(), hashed]
    );

    const user = rows[0];
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_url: user.avatar_url },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ success: false, message: "Registration failed." });
  }
};

// ─── POST /api/auth/google (public — users only) ────────────────────────────
const googleLogin = async (req, res) => {
  const { credential } = req.body; // Google ID token from frontend
  if (!credential)
    return res.status(400).json({ success: false, message: "Google credential is required." });

  try {
    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Check if user exists by google_id or email
    let { rows } = await pool.query(
      "SELECT * FROM users WHERE google_id = $1 OR email = $2",
      [googleId, email.toLowerCase()]
    );

    let user;

    if (rows.length > 0) {
      user = rows[0];

      // If user exists with email but hasn't linked Google yet, link it
      if (!user.google_id) {
        await pool.query(
          "UPDATE users SET google_id = $1, avatar_url = COALESCE(avatar_url, $2), updated_at = NOW() WHERE id = $3",
          [googleId, picture, user.id]
        );
      }

      // Prevent admin accounts from using Google login
      if (user.role === "admin") {
        return res.status(403).json({
          success: false,
          message: "Admin accounts must use email/password login.",
        });
      }

      if (!user.is_active) {
        return res.status(403).json({ success: false, message: "Account is disabled." });
      }
    } else {
      // Create new user with Google
      const result = await pool.query(
        `INSERT INTO users (name, email, google_id, avatar_url, role, auth_provider)
         VALUES ($1, $2, $3, $4, 'user', 'google')
         RETURNING id, name, email, role, avatar_url, created_at`,
        [name, email.toLowerCase(), googleId, picture]
      );
      user = result.rows[0];
    }

    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_url: user.avatar_url },
    });
  } catch (err) {
    console.error("Google login error:", err);
    res.status(401).json({ success: false, message: "Invalid Google credential." });
  }
};

// ─── POST /api/auth/login (email + password) ────────────────────────────────
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

    // If user registered via Google only (no password set)
    if (!user.password && user.auth_provider === "google") {
      return res.status(400).json({
        success: false,
        message: "This account uses Google Sign-In. Please login with Google.",
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ success: false, message: "Invalid email or password." });

    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_url: user.avatar_url },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error during login." });
  }
};

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, email, role, avatar_url, auth_provider, created_at FROM users WHERE id = $1",
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: "User not found." });
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
};

// ─── GET /api/users (admin only) ────────────────────────────────────────────
const getAllUsers = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, email, role, auth_provider, is_active, avatar_url, created_at FROM users ORDER BY created_at DESC"
    );
    res.json({ success: true, users: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch users." });
  }
};

// ─── POST /api/users (admin creates user) ───────────────────────────────────
const createUser = async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role)
    return res.status(400).json({ success: false, message: "All fields are required." });

  if (!["admin", "user"].includes(role))
    return res.status(400).json({ success: false, message: "Role must be 'admin' or 'user'." });

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
      email.toLowerCase().trim(),
    ]);
    if (existing.rows.length > 0)
      return res.status(409).json({ success: false, message: "Email already in use." });

    const hashed = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password, role, auth_provider)
       VALUES ($1, $2, $3, $4, 'local')
       RETURNING id, name, email, role, is_active, created_at`,
      [name.trim(), email.toLowerCase().trim(), hashed, role]
    );
    res.status(201).json({ success: true, user: rows[0] });
  } catch (err) {
    console.error("Create user error:", err);
    res.status(500).json({ success: false, message: "Failed to create user." });
  }
};

// ─── PUT /api/users/:id (admin only) ────────────────────────────────────────
const updateUser = async (req, res) => {
  const { id } = req.params;
  const { name, email, password, role, is_active } = req.body;

  try {
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined)      { fields.push(`name = $${idx++}`);      values.push(name.trim()); }
    if (email !== undefined)     { fields.push(`email = $${idx++}`);     values.push(email.toLowerCase().trim()); }
    if (role !== undefined)      { fields.push(`role = $${idx++}`);      values.push(role); }
    if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }
    if (password) {
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
       RETURNING id, name, email, role, is_active, auth_provider, created_at`,
      values
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: "User not found." });
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    console.error("Update user error:", err);
    res.status(500).json({ success: false, message: "Failed to update user." });
  }
};

// ─── DELETE /api/users/:id (admin only) ──────────────────────────────────────
const deleteUser = async (req, res) => {
  const { id } = req.params;

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

module.exports = { login, register, googleLogin, getMe, getAllUsers, createUser, updateUser, deleteUser };
