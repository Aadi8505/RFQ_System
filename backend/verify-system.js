#!/usr/bin/env node
const http = require("http");

// Simple HTTP request wrapper
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : "";

    const options = {
      hostname: "localhost",
      port: 5000,
      path: path,
      method: method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (bodyStr) {
      options.headers["Content-Length"] = bodyStr.length;
    }

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: { raw: data } });
        }
      });
    });

    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function runTests() {
  console.log("\n" + "=".repeat(90));
  console.log("🚀 RFQ AUCTION SYSTEM - TEST VERIFICATION REPORT");
  console.log("=".repeat(90) + "\n");

  let passCount = 0;
  let failCount = 0;

  try {
    // ====== TEST 1: Health ======
    console.log("TEST 1: Health Check");
    console.log("-".repeat(90));
    const t1 = await request("GET", "/api/health");
    const t1Pass = t1.status === 200 && t1.body.message === "Server running";
    console.log(t1Pass ? "✅ PASS" : "❌ FAIL", "- Server is running");
    t1Pass ? passCount++ : failCount++;
    console.log(`   Response: ${JSON.stringify(t1.body)}\n`);

    if (!t1Pass) {
      console.log("❌ Cannot continue testing - server not responding");
      return;
    }

    // ====== TEST 2: Create Valid RFQ ======
    console.log("TEST 2: Create Valid RFQ");
    console.log("-".repeat(90));
    const now = new Date();
    const rfqPayload = {
      name: "RFQ-VERIFICATION-001",
      bid_start_time: new Date(now.getTime() - 120000).toISOString(), // 2 min ago
      bid_close_time: new Date(now.getTime() + 3600000).toISOString(), // 60 min from now
      forced_close_time: new Date(now.getTime() + 7200000).toISOString(), // 120 min from now
      service_date: new Date(now.getTime() + 86400000).toISOString(), // tomorrow
      trigger_window: 10,
      extension_duration: 5,
      trigger_type: "ANY_BID",
    };

    const t2 = await request("POST", "/api/rfq", rfqPayload);
    const t2Pass = t2.status === 201 && t2.body.data?.id;
    const rfqId = t2.body.data?.id;
    console.log(t2Pass ? "✅ PASS" : "❌ FAIL", "- RFQ created successfully");
    console.log(`   RFQ ID: ${rfqId}`);
    console.log(`   Trigger Type: ${t2.body.data?.trigger_type}`);
    console.log(
      `   Extension Duration: ${t2.body.data?.extension_duration} minutes\n`,
    );
    t2Pass ? passCount++ : failCount++;

    if (!t2Pass) {
      console.log("❌ Cannot continue - RFQ creation failed");
      console.log(`   Error: ${t2.body.message}`);
      return;
    }

    // ====== TEST 3: Bid 1 (First Bid = L1) ======
    console.log("TEST 3: Place First Bid (L1 Determination)");
    console.log("-".repeat(90));
    const bid1Payload = { rfq_id: rfqId, bid_amount: 10000 };
    const t3 = await request("POST", "/api/bid", bid1Payload);
    const t3Pass = t3.status === 200 && t3.body.data?.bid_is_l1 === true;
    console.log(
      t3Pass ? "✅ PASS" : "❌ FAIL",
      "- First bid is correctly marked as L1",
    );
    console.log(`   Message: ${t3.body.message}`);
    console.log(`   L1 Status: ${t3.body.data?.bid_is_l1 ? "YES" : "NO"}\n`);
    t3Pass ? passCount++ : failCount++;

    // ====== TEST 4: Bid 2 (Higher Bid = Not L1) ======
    console.log("TEST 4: Place Higher Bid (Not L1)");
    console.log("-".repeat(90));
    const bid2Payload = { rfq_id: rfqId, bid_amount: 12000 };
    const t4 = await request("POST", "/api/bid", bid2Payload);
    const t4Pass = t4.status === 200 && t4.body.data?.bid_is_l1 === false;
    console.log(
      t4Pass ? "✅ PASS" : "❌ FAIL",
      "- Higher bid is correctly NOT marked as L1",
    );
    console.log(`   Message: ${t4.body.message}`);
    console.log(`   L1 Status: ${t4.body.data?.bid_is_l1 ? "YES" : "NO"}\n`);
    t4Pass ? passCount++ : failCount++;

    // ====== TEST 5: Bid 3 (Lower Bid = New L1) ======
    console.log("TEST 5: Place Lower Bid (New L1)");
    console.log("-".repeat(90));
    const bid3Payload = { rfq_id: rfqId, bid_amount: 9000 };
    const t5 = await request("POST", "/api/bid", bid3Payload);
    const t5Pass = t5.status === 200 && t5.body.data?.bid_is_l1 === true;
    console.log(t5Pass ? "✅ PASS" : "❌ FAIL", "- Lower bid becomes new L1");
    console.log(`   Message: ${t5.body.message}`);
    console.log(`   L1 Status: ${t5.body.data?.bid_is_l1 ? "YES" : "NO"}\n`);
    t5Pass ? passCount++ : failCount++;

    // ====== TEST 6: Missing Fields Validation ======
    console.log("TEST 6: RFQ Creation Validation - Missing Fields");
    console.log("-".repeat(90));
    const t6 = await request("POST", "/api/rfq", {
      name: "Invalid RFQ",
      bid_start_time: rfqPayload.bid_start_time,
    });
    const t6Pass = t6.status === 400 && t6.body.success === false;
    console.log(
      t6Pass ? "✅ PASS" : "❌ FAIL",
      "- Missing fields correctly rejected",
    );
    console.log(`   Error: ${t6.body.message}\n`);
    t6Pass ? passCount++ : failCount++;

    // ====== TEST 7: RFQ Not Found ======
    console.log("TEST 7: Bid Placement Validation - RFQ Not Found");
    console.log("-".repeat(90));
    const t7 = await request("POST", "/api/bid", {
      rfq_id: 999999,
      bid_amount: 5000,
    });
    const t7Pass = t7.status === 404 && t7.body.success === false;
    console.log(
      t7Pass ? "✅ PASS" : "❌ FAIL",
      "- Non-existent RFQ correctly rejected",
    );
    console.log(`   Error: ${t7.body.message}\n`);
    t7Pass ? passCount++ : failCount++;

    // ====== TEST 8: Invalid Time Order ======
    console.log("TEST 8: RFQ Validation - Invalid Time Order");
    console.log("-".repeat(90));
    const t8 = await request("POST", "/api/rfq", {
      name: "Invalid Times",
      bid_start_time: new Date(now.getTime() + 7200000).toISOString(),
      bid_close_time: new Date(now.getTime() + 3600000).toISOString(), // Earlier than start!
      forced_close_time: new Date(now.getTime() + 7200000).toISOString(),
      service_date: rfqPayload.service_date,
    });
    const t8Pass = t8.status === 400 && t8.body.success === false;
    console.log(
      t8Pass ? "✅ PASS" : "❌ FAIL",
      "- Invalid time order correctly rejected",
    );
    console.log(`   Error: ${t8.body.message}\n`);
    t8Pass ? passCount++ : failCount++;

    // ====== SUMMARY ======
    console.log("=".repeat(90));
    console.log("TEST SUMMARY");
    console.log("=".repeat(90));
    console.log(`✅ PASSED: ${passCount}`);
    console.log(`❌ FAILED: ${failCount}`);
    console.log(`TOTAL: ${passCount + failCount}`);
    console.log(
      `SUCCESS RATE: ${Math.round((passCount / (passCount + failCount)) * 100)}%\n`,
    );

    if (failCount === 0) {
      console.log("🎉 ALL TESTS PASSED! System is working correctly.\n");
    } else {
      console.log("⚠️  Some tests failed. Review errors above.\n");
    }
  } catch (err) {
    console.error("\n❌ ERROR:", err.message);
  }
}

runTests();
