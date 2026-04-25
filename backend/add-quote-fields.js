// Add quote fields to the bids table
const { pool } = require("./config/db");

async function addQuoteFields() {
  try {
    await pool.query(`
      ALTER TABLE bids 
        ADD COLUMN IF NOT EXISTS carrier_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS freight_charges DECIMAL(12, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS origin_charges DECIMAL(12, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS destination_charges DECIMAL(12, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS transit_time VARCHAR(100),
        ADD COLUMN IF NOT EXISTS validity VARCHAR(100);
    `);
    console.log("✅ Quote fields added to bids table.");
    await pool.end();
  } catch (err) {
    console.error("❌ Error:", err.message);
    await pool.end();
    process.exit(1);
  }
}

addQuoteFields();
