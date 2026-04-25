const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function check() {
  const result = await pool.query(`
    SELECT 
      NOW() as db_now,
      (SELECT bid_close_time FROM rfq WHERE id = 15) as rfq15_close,
      (SELECT forced_close_time FROM rfq WHERE id = 15) as rfq15_forced
  `);

  const row = result.rows[0];
  const dbNow = new Date(row.db_now);
  const rfqClose = new Date(row.rfq15_close);
  const rfqForced = new Date(row.rfq15_forced);

  console.log("Database Now:", dbNow.toISOString());
  console.log("RFQ 15 Close:", rfqClose.toISOString());
  console.log("RFQ 15 Forced:", rfqForced.toISOString());
  console.log("");
  console.log(
    "Now >= Forced?",
    dbNow >= rfqForced ? "✅ YES (CLOSED)" : "❌ NO (OPEN)",
  );
  console.log(
    "Now < Close?",
    dbNow < rfqClose ? "✅ YES (OPEN)" : "❌ NO (CLOSED)",
  );

  await pool.end();
}

check().catch((e) => console.error("Error:", e));
