const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function checkTimes() {
  try {
    // Get database time
    const timeResult = await pool.query("SELECT NOW() as db_time");
    const dbTime = new Date(timeResult.rows[0].db_time);

    console.log("Database Current Time:", dbTime.toISOString());
    console.log("Local Current Time:", new Date().toISOString());

    // Get RFQ records
    const rfqResult = await pool.query(
      `SELECT id, name, bid_start_time, bid_close_time, forced_close_time 
       FROM rfq WHERE id >= 12 ORDER BY id DESC LIMIT 5`,
    );

    console.log("\n✅ RFQ Records:");
    console.log(
      "┌─────────────────────────────────────────────────────────────────────────────────────────┐",
    );
    rfqResult.rows.forEach((rfq) => {
      console.log(`ID: ${rfq.id} | ${rfq.name}`);
      console.log(`  Start:  ${new Date(rfq.bid_start_time).toISOString()}`);
      console.log(`  Close:  ${new Date(rfq.bid_close_time).toISOString()}`);
      console.log(`  Forced: ${new Date(rfq.forced_close_time).toISOString()}`);
      console.log(
        `  Status: ${dbTime >= new Date(rfq.forced_close_time) ? "❌ CLOSED" : "✅ OPEN"}`,
      );
    });
    console.log(
      "└─────────────────────────────────────────────────────────────────────────────────────────┘",
    );

    // Get bids
    const bidsResult = await pool.query(
      `SELECT rfq_id, COUNT(*) as bid_count FROM bids GROUP BY rfq_id ORDER BY rfq_id DESC LIMIT 10`,
    );

    console.log("\n✅ Bid Counts:");
    bidsResult.rows.forEach((bid) => {
      console.log(`  RFQ ${bid.rfq_id}: ${bid.bid_count} bids`);
    });
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await pool.end();
  }
}

checkTimes();
