const axios = require("axios");
const { pool } = require("./config/db");

const API_URL = "http://localhost:5000/api";

async function test() {
  try {
    console.log("=".repeat(90));
    console.log("🧪 EDGE CASE TESTING - NEW FORMAT (Minutes from Now)");
    console.log("=".repeat(90));

    // Create RFQ using NEW format (minutes from now)
    console.log(`\n📅 Creating RFQ with NEW format:
  Start:  +30 seconds from now
  Close:  +10 minutes from now
  Forced: +20 minutes from now`);

    const createRes = await axios.post(`${API_URL}/rfq`, {
      name: "Edge Case Test RFQ - NEW FORMAT",
      start_minutes_from_now: 0.5, // Start in 30 seconds
      close_minutes_from_now: 10, // Close in 10 minutes
      forced_close_minutes_from_now: 20, // Forced close in 20 minutes
      service_date: new Date(new Date().getTime() + 200 * 60000).toISOString(),
      trigger_window: 2, // 2 minutes before close
      extension_duration: 5,
      trigger_type: "ANY_BID",
    });

    const rfqId = createRes.data.data.id;
    console.log(`\n✅ RFQ Created: ID ${rfqId}`);

    // Wait for auction to start (30 seconds + 5 sec buffer)
    console.log(`\n⏳ Waiting 35 seconds for auction to start...`);
    await new Promise((r) => setTimeout(r, 35000));

    // TEST 1: Place first bid (L1)
    console.log(`\n${"=".repeat(90)}`);
    console.log("TEST 1: Place First Bid (Should be L1)");
    console.log("=".repeat(90));
    const bid1Res = await axios.post(`${API_URL}/bid`, {
      rfq_id: rfqId,
      bid_amount: 1000,
    });
    console.log(`✅ Status: ${bid1Res.data.message}`);
    console.log(
      `L1 Status: ${bid1Res.data.data.bid_is_l1 ? "✅ YES (L1)" : "❌ NO"}`,
    );
    const test1Pass = bid1Res.data.data.bid_is_l1;
    console.log(`${test1Pass ? "✅ TEST 1 PASSED" : "❌ TEST 1 FAILED"}`);

    // TEST 2: Place higher bid (NOT L1)
    console.log(`\n${"=".repeat(90)}`);
    console.log("TEST 2: Place Higher Bid (Should NOT be L1)");
    console.log("=".repeat(90));
    const bid2Res = await axios.post(`${API_URL}/bid`, {
      rfq_id: rfqId,
      bid_amount: 1500,
    });
    console.log(`✅ Status: ${bid2Res.data.message}`);
    console.log(
      `L1 Status: ${bid2Res.data.data.bid_is_l1 ? "❌ YES (wrong)" : "✅ NO (correct)"}`,
    );
    const test2Pass = !bid2Res.data.data.bid_is_l1;
    console.log(`${test2Pass ? "✅ TEST 2 PASSED" : "❌ TEST 2 FAILED"}`);

    // TEST 3: Place lower bid (NEW L1)
    console.log(`\n${"=".repeat(90)}`);
    console.log("TEST 3: Place Lower Bid (Should be NEW L1)");
    console.log("=".repeat(90));
    const bid3Res = await axios.post(`${API_URL}/bid`, {
      rfq_id: rfqId,
      bid_amount: 800,
    });
    console.log(`✅ Status: ${bid3Res.data.message}`);
    console.log(
      `L1 Status: ${bid3Res.data.data.bid_is_l1 ? "✅ YES (NEW L1)" : "❌ NO"}`,
    );
    const test3Pass = bid3Res.data.data.bid_is_l1;
    console.log(`${test3Pass ? "✅ TEST 3 PASSED" : "❌ TEST 3 FAILED"}`);

    console.log(`\n${"=".repeat(90)}`);
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(90));
    console.log(
      `Test 1 (First bid is L1):        ${test1Pass ? "✅ PASS" : "❌ FAIL"}`,
    );
    console.log(
      `Test 2 (Higher bid NOT L1):      ${test2Pass ? "✅ PASS" : "❌ FAIL"}`,
    );
    console.log(
      `Test 3 (Lower bid becomes L1):   ${test3Pass ? "✅ PASS" : "❌ FAIL"}`,
    );
    console.log(
      `\nOVERALL: ${test1Pass && test2Pass && test3Pass ? "✅ ALL TESTS PASSED" : "❌ SOME TESTS FAILED"}`,
    );
    console.log("=".repeat(90));

    await pool.end();
  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
    await pool.end();
    process.exit(1);
  }
}

test();
