const { pool } = require("../config/db");

// Get all active categories
const getCategories = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, description, icon FROM categories WHERE is_active = TRUE ORDER BY name ASC"
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Error fetching categories:", err.message);
    res.status(500).json({ success: false, message: "Failed to fetch categories." });
  }
};

module.exports = { getCategories };
