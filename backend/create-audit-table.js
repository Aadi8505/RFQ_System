// Script to create the rfq_audit table if it doesn't exist
const { pool } = require("./config/db");

async function createAuditTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rfq_audit (
        id SERIAL PRIMARY KEY,
        rfq_id INTEGER NOT NULL,
        action VARCHAR(255),
        old_bid_close_time TIMESTAMP,
        new_bid_close_time TIMESTAMP,
        changed_by VARCHAR(100) DEFAULT 'system',
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (rfq_id) REFERENCES rfq(id) ON DELETE CASCADE
      );
    `);
    console.log("✅ rfq_audit table created (or already exists).");
    await pool.end();
  } catch (err) {
    console.error("❌ Error:", err.message);
    await pool.end();
    process.exit(1);
  }
}

createAuditTable();
