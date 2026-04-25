const axios = require("axios");
const { pool } = require("./config/db");

const API_URL = "http://localhost:5000/api";

async function test() {
  try {
    console.log("=".repeat(90));
    console.log("🧪 EDGE CASE TESTING - USING DATABASE SYNCHRONIZED TIMES");
    console.log("=".repeat(90));

    // Get database NOW
    const dbNowRes = await pool.query("SELECT NOW() as now");
    const dbNow = new Date(dbNowRes.rows[0].now);
    console.log(`\n📍 Database NOW: ${dbNow.toISOString()}`);

    // Create times by adding seconds to database NOW
    const startTime = new Date(dbNow.getTime() + 30 * 1000); // +30 seconds
    const closeTime = new Date(dbNow.getTime() + 90 * 1000); // +90 seconds
    const forcedTime = new Date(dbNow.getTime() + 120 * 1000); // +120 seconds

    console.log(`\n📅 Creating RFQ with times:
  Start:  ${startTime.toISOString()} (+30s)
  Close:  ${closeTime.toISOString()} (+90s)
  Forced: ${forcedTime.toISOString()} (+120s)`);

    // Create RFQ
    const createRes = await axios.post(`${API_URL}/rfq`, {
      name: "Edge Case Test RFQ",
      bid_start_time: startTime.toISOString(),
      bid_close_time: closeTime.toISOString(),
      forced_close_time: forcedTime.toISOString(),
      service_date: new Date(dbNow.getTime() + 200 * 60000).toISOString(),
      trigger_window: 10, // 10 seconds before close
      extension_duration: 5,
      trigger_type: "ANY_BID",
    });

    const rfqId = createRes.data.data.id;
    console.log(`\n✅ RFQ Created: ID ${rfqId}`);

    // Wait for auction to start (30 seconds + buffer)
    console.log(`\n⏳ Waiting 32 seconds for auction to start...`);
    await new Promise((r) => setTimeout(r, 32000));

    // TEST 1: Place first bid (L1)
    console.log(`\n${"=".repeat(90)}`);
    console.log("TEST 1: Place First Bid (Should be L1)");
    console.log("=".repeat(90));
    const bid1Res = await axios.post(`${API_URL}/bid`, {
      rfq_id: rfqId,
      bid_amount: 1000,
    });
    console.log(`Message: ${bid1Res.data.message}`);
    console.log(
      `L1 Status: ${bid1Res.data.data.bid_is_l1 ? "✅ YES (L1)" : "❌ NO"}`,
    );
    console.log(`Response:`, JSON.stringify(bid1Res.data, null, 2));

    // TEST 2: Place higher bid (NOT L1)
    console.log(`\n${"=".repeat(90)}`);
    console.log("TEST 2: Place Higher Bid (Should NOT be L1)");
    console.log("=".repeat(90));
    const bid2Res = await axios.post(`${API_URL}/bid`, {
      rfq_id: rfqId,
      bid_amount: 1500,
    });
    console.log(`Message: ${bid2Res.data.message}`);
    console.log(
      `L1 Status: ${bid2Res.data.data.bid_is_l1 ? "✅ YES (L1)" : "❌ NO (correct)"}`,
    );
    console.log(`Response:`, JSON.stringify(bid2Res.data, null, 2));

    // TEST 3: Place lower bid (NEW L1)
    console.log(`\n${"=".repeat(90)}`);
    console.log("TEST 3: Place Lower Bid (Should be NEW L1)");
    console.log("=".repeat(90));
    const bid3Res = await axios.post(`${API_URL}/bid`, {
      rfq_id: rfqId,
      bid_amount: 800,
    });
    console.log(`Message: ${bid3Res.data.message}`);
    console.log(
      `L1 Status: ${bid3Res.data.data.bid_is_l1 ? "✅ YES (NEW L1)" : "❌ NO"}`,
    );
    console.log(`Response:`, JSON.stringify(bid3Res.data, null, 2));

    console.log(`\n${"=".repeat(90)}`);
    console.log("✅ ALL EDGE CASE TESTS COMPLETED");
    console.log("=".repeat(90));

    await pool.end();
  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
    await pool.end();
    process.exit(1);
  }
}

test();
