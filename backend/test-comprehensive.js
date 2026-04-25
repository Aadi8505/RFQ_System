const http = require("http");

function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : "";
    const headers = { "Content-Type": "application/json" };
    if (bodyStr) {
      headers["Content-Length"] = bodyStr.length;
    }

    const options = {
      hostname: "localhost",
      port: 5000,
      path: path,
      method: method,
      headers: headers,
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function testComprehensive() {
  console.log("🚀 Comprehensive RFQ Auction System Test\n");
  console.log("=".repeat(80));

  try {
    // TEST 1: Health Check
    console.log("\n📋 TEST 1: Health Check");
    const health = await makeRequest("GET", "/api/health", null);
    console.log("   Status:", health.status === 200 ? "✅ PASS" : "❌ FAIL");
    console.log("   Response:", health.data);

    // TEST 2: Create RFQ with excessive future times (to account for timezone offset)
    console.log("\n📋 TEST 2: Create RFQ with Very Far Future Times");
    const now = new Date();
    // Using minutes-from-now format to avoid timezone issues
    const serviceDate = new Date(now.getTime() + 72 * 60000); // 72 minutes from now

    console.log("   Times being sent (using server-relative minutes):");
    console.log("   - Start: 48 minutes from now");
    console.log("   - Close: 49 minutes from now");
    console.log("   - Forced: 50 minutes from now");

    const rfqResult = await makeRequest("POST", "/api/rfq", {
      name: "RFQ-TestSuite-001",
      start_minutes_from_now: 48,
      close_minutes_from_now: 49,
      forced_close_minutes_from_now: 50,
      service_date: serviceDate.toISOString(),
    });

    console.log("   Status:", rfqResult.status === 201 ? "✅ PASS" : "❌ FAIL");
    if (rfqResult.data.data?.id) {
      console.log("   RFQ ID:", rfqResult.data.data.id);
      const rfqId = rfqResult.data.data.id;

      // Wait to ensure times are in proper order
      await new Promise((r) => setTimeout(r, 500));

      // TEST 3: Place Bid - Bid 1 (First Bid - should be L1)
      console.log("\n📋 TEST 3: Place First Bid (Should be L1)");
      const bid1 = await makeRequest("POST", "/api/bid", {
        rfq_id: rfqId,
        bid_amount: 10000,
      });

      if (bid1.status === 200) {
        console.log("   Status: ✅ PASS");
        console.log("   Message:", bid1.data.message);
        console.log(
          "   L1 Status:",
          bid1.data.data?.bid_is_l1 ? "✅ YES" : "❌ NO",
        );
      } else {
        console.log("   Status: ❌ FAIL");
        console.log("   Error:", bid1.data.message);
      }

      // TEST 4: Place Bid - Bid 2 (Higher bid - not L1)
      if (bid1.status === 200) {
        console.log("\n📋 TEST 4: Place Higher Bid (Should NOT be L1)");
        const bid2 = await makeRequest("POST", "/api/bid", {
          rfq_id: rfqId,
          bid_amount: 12000,
        });

        console.log("   Status:", bid2.status === 200 ? "✅ PASS" : "❌ FAIL");
        console.log(
          "   L1 Status:",
          bid2.data.data?.bid_is_l1 ? "❌ YES (WRONG!)" : "✅ NO",
        );
      }

      // TEST 5: Place Bid - Bid 3 (Lower bid - becomes new L1)
      if (bid1.status === 200) {
        console.log("\n📋 TEST 5: Place Lower Bid (Should be new L1)");
        const bid3 = await makeRequest("POST", "/api/bid", {
          rfq_id: rfqId,
          bid_amount: 9000,
        });

        console.log("   Status:", bid3.status === 200 ? "✅ PASS" : "❌ FAIL");
        console.log(
          "   L1 Status:",
          bid3.data.data?.bid_is_l1 ? "✅ YES" : "❌ NO",
        );
      }
    } else {
      console.log("   Status: ❌ FAIL");
      console.log("   Error:", rfqResult.data.message);
    }

    // TEST 6: Create RFQ with Missing Field
    console.log("\n📋 TEST 6: Validation - Missing Required Field");
    const invalidRFQ = await makeRequest("POST", "/api/rfq", {
      name: "Invalid RFQ",
      bid_start_time: start,
      // Missing other required fields
    });

    console.log(
      "   Status:",
      invalidRFQ.status === 400 ? "✅ PASS (correctly rejected)" : "❌ FAIL",
    );
    console.log("   Error:", invalidRFQ.data.message);

    // TEST 7: Place Bid with Missing Field
    console.log("\n📋 TEST 7: Validation - Missing RFQ ID in Bid");
    const invalidBid = await makeRequest("POST", "/api/bid", {
      bid_amount: 5000,
      // Missing rfq_id
    });

    console.log(
      "   Status:",
      invalidBid.status === 400 ? "✅ PASS (correctly rejected)" : "❌ FAIL",
    );
    console.log("   Error:", invalidBid.data.message);

    // TEST 8: Place Bid on Non-existent RFQ
    console.log("\n📋 TEST 8: Validation - RFQ Not Found");
    const notFoundBid = await makeRequest("POST", "/api/bid", {
      rfq_id: 999999,
      bid_amount: 5000,
    });

    console.log(
      "   Status:",
      notFoundBid.status === 404 ? "✅ PASS (correctly rejected)" : "❌ FAIL",
    );
    console.log("   Error:", notFoundBid.data.message);
  } catch (err) {
    console.error("\n❌ Test Error:", err.message);
  }

  console.log("\n" + "=".repeat(80));
  console.log("✅ Test Suite Complete\n");
}

testComprehensive();
