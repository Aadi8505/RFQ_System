const http = require("http");
const { Pool } = require("pg");
require("dotenv").config();

// First, get the database time
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function createValidRFQ() {
  // Get current DB time
  const result = await pool.query("SELECT NOW() as db_now");
  const dbNow = new Date(result.rows[0].db_now);

  console.log("Database NOW:", dbNow.toISOString());

  // Create times relative to DATABASE time (not local time)
  // Add buffers to ensure they're in the future
  const bidStart = new Date(dbNow.getTime() + 2 * 60000); // 2 minutes from DB now
  const bidClose = new Date(dbNow.getTime() + 65 * 60000); // 65 minutes from DB now
  const bidForced = new Date(dbNow.getTime() + 125 * 60000); // 125 minutes from DB now
  const serviceDate = new Date(dbNow.getTime() + 24 * 3600000);

  console.log("Creating RFQ:");
  console.log("  Start (DB+2min):", bidStart.toISOString());
  console.log("  Close (DB+65min):", bidClose.toISOString());
  console.log("  Forced (DB+125min):", bidForced.toISOString());

  const payload = JSON.stringify({
    name: "RFQ-DB-Synced",
    bid_start_time: bidStart.toISOString(),
    bid_close_time: bidClose.toISOString(),
    forced_close_time: bidForced.toISOString(),
    service_date: serviceDate.toISOString(),
  });

  const options = {
    hostname: "localhost",
    port: 5000,
    path: "/api/rfq",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": payload.length,
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const rfq = JSON.parse(data);
        console.log("\n✅ RFQ Created:");
        console.log("   ID:", rfq.data.id);
        console.log("   Stored Start:", rfq.data.bid_start_time);
        console.log("   Stored Close:", rfq.data.bid_close_time);
        console.log("   Stored Forced:", rfq.data.forced_close_time);
        resolve(rfq.data.id);
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function testBidding(rfqId) {
  // Wait 1 second for auction to start
  await new Promise((r) => setTimeout(r, 1000));

  console.log("\n✅ Placing bid on RFQ", rfqId);

  const payload = JSON.stringify({ rfq_id: rfqId, bid_amount: 5000 });

  const options = {
    hostname: "localhost",
    port: 5000,
    path: "/api/bid",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": payload.length,
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const bid = JSON.parse(data);
        console.log("   Status:", bid.success ? "✅ SUCCESS" : "❌ FAILED");
        console.log("   Message:", bid.message);
        console.log(
          "   L1 Status:",
          bid.data?.bid_is_l1 ? "YES (First Place)" : "NO",
        );
        if (bid.data?.rfq) {
          console.log(
            "   Auction Extended?:",
            bid.data.rfq.bid_close_time !== rfq.bid_close_time ? "YES" : "NO",
          );
        }
        resolve(bid);
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  try {
    const rfqId = await createValidRFQ();
    await testBidding(rfqId);
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await pool.end();
  }
}

main();
