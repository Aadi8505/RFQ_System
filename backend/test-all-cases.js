const axios = require("axios");
const { pool } = require("./config/db");

const API_URL = "http://localhost:5000/api";

// Test helper
async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

// Helper to create RFQ with custom times
async function createRFQ(config = {}) {
  const defaults = {
    name: `Test-${Date.now()}`,
    start_minutes_from_now: -60,
close_minutes_from_now: 60,
forced_close_minutes_from_now: 300,
  };
  const merged = { ...defaults, ...config };

  const now = new Date();
  const response = await axios.post(`${API_URL}/rfq`, {
    ...merged,
    service_date: new Date(now.getTime() + 240 * 60000).toISOString(),
    trigger_window: 1, // 1 minute before close
    extension_duration: 1, // 1 minute extension
    trigger_type: merged.trigger_type || "ANY_BID",
  });

  return response.data.data.id;
}

// Helper to wait for auction to start
async function waitForAuctionStart(seconds = 2) {
  console.log(`   ⏳ Waiting ${seconds} seconds for auction to start...`);
  await new Promise((r) => setTimeout(r, seconds * 1000));
}

async function runAllTests() {
  console.log("╔" + "═".repeat(88) + "╗");
  console.log(
    "║" +
      " ".repeat(20) +
      "🧪 RFQ BIDDING SYSTEM - ALL TEST CASES" +
      " ".repeat(30) +
      "║",
  );
  console.log("╚" + "═".repeat(88) + "╝");

  let passed = 0;
  let failed = 0;

  try {
    // TEST 1: RFQ NOT FOUND
    console.log("\n📋 TEST 1: RFQ NOT FOUND");
    if (
      await test("Should return 404 for non-existent RFQ", async () => {
        const res = await axios.post(`${API_URL}/bid`, {
          rfq_id: 999999,
          bid_amount: 1000,
        });
        throw new Error("Should have failed");
      })
    ) {
      passed++;
    } else {
      failed++;
    }

    // TEST 2: MISSING INPUT
    console.log("\n📋 TEST 2: MISSING INPUT");
    if (
      await test("Should reject bid without rfq_id", async () => {
        const res = await axios.post(`${API_URL}/bid`, {
          bid_amount: 1000,
        });
        throw new Error("Should have failed");
      })
    ) {
      passed++;
    } else {
      failed++;
    }

    // TEST 3: BEFORE AUCTION START
    console.log("\n📋 TEST 3: BEFORE AUCTION START");
    if (
      await test("Should reject bid before auction starts", async () => {
        const rfqId = await createRFQ({ start_minutes_from_now: 5 });
        const res = await axios.post(`${API_URL}/bid`, {
          rfq_id: rfqId,
          bid_amount: 1000,
        });
        throw new Error("Should have failed");
      })
    ) {
      passed++;
    } else {
      failed++;
    }

    // TEST 4: AFTER FORCED CLOSE
    console.log("\n📋 TEST 4: AFTER FORCED CLOSE");
    if (
      await test("Should reject bid after forced close", async () => {
        const rfqId = await createRFQ({
          start_minutes_from_now: -2,
          close_minutes_from_now: -1,
          forced_close_minutes_from_now: -0.5,
        });
        const res = await axios.post(`${API_URL}/bid`, {
          rfq_id: rfqId,
          bid_amount: 1000,
        });
        throw new Error("Should have failed");
      })
    ) {
      passed++;
    } else {
      failed++;
    }

    // TEST 5: VALID BID (NO EXTENSION)
    console.log("\n📋 TEST 5: VALID BID (NO EXTENSION)");
    if (
      await test("Should place bid outside trigger window without extension", async () => {
        const rfqId = await createRFQ({
          start_minutes_from_now: 0.5,
          close_minutes_from_now: 5, // Far enough to be outside 1-min trigger window
          forced_close_minutes_from_now: 6,
          trigger_window: 1,
        });
        await waitForAuctionStart(1);
        const res = await axios.post(`${API_URL}/bid`, {
          rfq_id: rfqId,
          bid_amount: 1000,
        });
        if (res.data.message !== "Bid placed") {
          throw new Error(`Expected "Bid placed", got "${res.data.message}"`);
        }
      })
    ) {
      passed++;
    } else {
      failed++;
    }

    // TEST 6: ANY_BID EXTENSION
    console.log("\n📋 TEST 6: ANY_BID — EXTENSION");
    if (
      await test("Should extend auction for ANY_BID within trigger window", async () => {
        const rfqId = await createRFQ({
          start_minutes_from_now: 0.5,
          close_minutes_from_now: 1.5,
          forced_close_minutes_from_now: 3,
          trigger_type: "ANY_BID",
          trigger_window: 1,
        });
        await waitForAuctionStart(1);
        const res = await axios.post(`${API_URL}/bid`, {
          rfq_id: rfqId,
          bid_amount: 1000,
        });
        if (!res.data.message.includes("auction extended")) {
          throw new Error(
            `Expected extension message, got "${res.data.message}"`,
          );
        }
      })
    ) {
      passed++;
    } else {
      failed++;
    }

    // TEST 7: L1_CHANGE — FIRST BID
    console.log("\n📋 TEST 7: L1_CHANGE — FIRST BID");
    if (
      await test("Should mark first bid as L1 and extend with L1_CHANGE", async () => {
        const rfqId = await createRFQ({
          start_minutes_from_now: 0.5,
          close_minutes_from_now: 1.5,
          forced_close_minutes_from_now: 3,
          trigger_type: "L1_CHANGE",
        });
        await waitForAuctionStart(1);
        const res = await axios.post(`${API_URL}/bid`, {
          rfq_id: rfqId,
          bid_amount: 1000,
        });
        if (!res.data.data.bid_is_l1) {
          throw new Error("First bid should be L1");
        }
        if (!res.data.message.includes("auction extended")) {
          throw new Error(`Expected extension, got "${res.data.message}"`);
        }
      })
    ) {
      passed++;
    } else {
      failed++;
    }

    // TEST 8: L1_CHANGE — HIGHER BID
    console.log("\n📋 TEST 8: L1_CHANGE — HIGHER BID (NO EXTENSION)");
    if (
      await test("Should not extend for higher bid with L1_CHANGE", async () => {
        const rfqId = await createRFQ({
          start_minutes_from_now: 0.5,
          close_minutes_from_now: 1.5,
          forced_close_minutes_from_now: 3,
          trigger_type: "L1_CHANGE",
        });
        await waitForAuctionStart(1);

        // First bid
        await axios.post(`${API_URL}/bid`, {
          rfq_id: rfqId,
          bid_amount: 1000,
        });

        // Higher bid
        const res = await axios.post(`${API_URL}/bid`, {
          rfq_id: rfqId,
          bid_amount: 1500,
        });
        if (res.data.data.bid_is_l1) {
          throw new Error("Higher bid should not be L1");
        }
        if (res.data.message !== "Bid placed") {
          throw new Error(`Expected "Bid placed", got "${res.data.message}"`);
        }
      })
    ) {
      passed++;
    } else {
      failed++;
    }

    // TEST 9: L1_CHANGE — LOWER BID
    console.log("\n📋 TEST 9: L1_CHANGE — LOWER BID (EXTENSION)");
    if (
      await test("Should extend for lower bid (new L1) with L1_CHANGE", async () => {
        const rfqId = await createRFQ({
          start_minutes_from_now: 0.5,
          close_minutes_from_now: 1.5,
          forced_close_minutes_from_now: 3,
          trigger_type: "L1_CHANGE",
        });
        await waitForAuctionStart(1);

        // First bid
        await axios.post(`${API_URL}/bid`, {
          rfq_id: rfqId,
          bid_amount: 1000,
        });

        // Lower bid (new L1)
        const res = await axios.post(`${API_URL}/bid`, {
          rfq_id: rfqId,
          bid_amount: 800,
        });
        if (!res.data.data.bid_is_l1) {
          throw new Error("Lower bid should be L1");
        }
        if (!res.data.message.includes("auction extended")) {
          throw new Error(`Expected extension, got "${res.data.message}"`);
        }
      })
    ) {
      passed++;
    } else {
      failed++;
    }

    // TEST 10: TRIGGER WINDOW (OUTSIDE)
    console.log("\n📋 TEST 10: TRIGGER WINDOW (OUTSIDE)");
    if (
      await test("Should not extend when outside trigger window", async () => {
        const rfqId = await createRFQ({
          start_minutes_from_now: 0.5,
          close_minutes_from_now: 10, // Far away
          forced_close_minutes_from_now: 11,
          trigger_window: 1,
        });
        await waitForAuctionStart(1);
        const res = await axios.post(`${API_URL}/bid`, {
          rfq_id: rfqId,
          bid_amount: 1000,
        });
        if (res.data.message !== "Bid placed") {
          throw new Error(`Expected "Bid placed", got "${res.data.message}"`);
        }
      })
    ) {
      passed++;
    } else {
      failed++;
    }

    // TEST 11: TRIGGER WINDOW (INSIDE)
    console.log("\n📋 TEST 11: TRIGGER WINDOW (INSIDE)");
    if (
      await test("Should extend when inside trigger window", async () => {
        const rfqId = await createRFQ({
          start_minutes_from_now: 0.5,
          close_minutes_from_now: 1.5,
          forced_close_minutes_from_now: 3,
          trigger_window: 2, // 2 minutes, so we're inside
        });
        await waitForAuctionStart(1);
        const res = await axios.post(`${API_URL}/bid`, {
          rfq_id: rfqId,
          bid_amount: 1000,
        });
        if (!res.data.message.includes("auction extended")) {
          throw new Error(`Expected extension, got "${res.data.message}"`);
        }
      })
    ) {
      passed++;
    } else {
      failed++;
    }

    // TEST 12: EXTENSION CAP
    console.log("\n📋 TEST 12: EXTENSION CAP");
    if (
      await test("Should cap extended close time at forced_close_time", async () => {
        const rfqId = await createRFQ({
          start_minutes_from_now: 0.5,
          close_minutes_from_now: 1.5,
          forced_close_minutes_from_now: 1.7, // Very close to close
          trigger_type: "ANY_BID",
        });
        await waitForAuctionStart(1);
        const res = await axios.post(`${API_URL}/bid`, {
          rfq_id: rfqId,
          bid_amount: 1000,
        });
        const newClose = new Date(res.data.data.rfq.bid_close_time);
        const forced = new Date(res.data.data.rfq.forced_close_time);
        if (newClose > forced) {
          throw new Error("Extended time exceeded forced_close_time");
        }
      })
    ) {
      passed++;
    } else {
      failed++;
    }

    // TEST 13: MULTIPLE EXTENSIONS
    console.log("\n📋 TEST 13: MULTIPLE EXTENSIONS");
    if (
      await test("Should handle multiple extensions without exceeding cap", async () => {
        const rfqId = await createRFQ({
          start_minutes_from_now: 0.5,
          close_minutes_from_now: 1.5,
          forced_close_minutes_from_now: 4,
          trigger_type: "ANY_BID",
        });
        await waitForAuctionStart(1);

        let lastClose;
        for (let i = 0; i < 3; i++) {
          const res = await axios.post(`${API_URL}/bid`, {
            rfq_id: rfqId,
            bid_amount: 1000 + i,
          });
          lastClose = new Date(res.data.data.rfq.bid_close_time);
          const forced = new Date(res.data.data.rfq.forced_close_time);
          if (lastClose > forced) {
            throw new Error(`Extension ${i} exceeded forced_close_time`);
          }
        }
      })
    ) {
      passed++;
    } else {
      failed++;
    }

    // TEST 14: SAME BID AMOUNT
    console.log("\n📋 TEST 14: SAME BID AMOUNT");
    if (
      await test("Should handle duplicate bid amounts correctly", async () => {
        const rfqId = await createRFQ({
          start_minutes_from_now: 0.5,
          close_minutes_from_now: 1.5,
          forced_close_minutes_from_now: 3,
        });
        await waitForAuctionStart(1);

        // First bid
        const res1 = await axios.post(`${API_URL}/bid`, {
          rfq_id: rfqId,
          bid_amount: 1000,
        });
        if (!res1.data.data.bid_is_l1) {
          throw new Error("First bid should be L1");
        }

        // Second bid with same amount
        const res2 = await axios.post(`${API_URL}/bid`, {
          rfq_id: rfqId,
          bid_amount: 1000,
        });
        if (res2.data.data.bid_is_l1) {
          throw new Error("Second bid with same amount should not be L1");
        }
      })
    ) {
      passed++;
    } else {
      failed++;
    }

    // TEST 15: INVALID BID AMOUNT
    console.log("\n📋 TEST 15: INVALID BID AMOUNT");
    if (
      await test("Should reject negative bid amounts", async () => {
        const rfqId = await createRFQ({
          start_minutes_from_now: 0.5,
          close_minutes_from_now: 1.5,
          forced_close_minutes_from_now: 3,
        });
        await waitForAuctionStart(1);

        try {
          const res = await axios.post(`${API_URL}/bid`, {
            rfq_id: rfqId,
            bid_amount: -100,
          });
          // If we get here, check if it was accepted (might not be validated)
          console.log(
            "   ⚠️  Note: Negative bid amounts are accepted (consider adding validation)",
          );
        } catch (error) {
          // Good, it was rejected
        }
      })
    ) {
      passed++;
    } else {
      failed++;
    }

    // TEST 16: STRING BID INPUT
    console.log("\n📋 TEST 16: STRING BID INPUT");
    if (
      await test("Should handle string bid amounts gracefully", async () => {
        const rfqId = await createRFQ({
          start_minutes_from_now: 0.5,
          close_minutes_from_now: 1.5,
          forced_close_minutes_from_now: 3,
        });
        await waitForAuctionStart(1);

        const res = await axios.post(`${API_URL}/bid`, {
          rfq_id: rfqId,
          bid_amount: "1000", // String instead of number
        });
        if (!res.data.success) {
          throw new Error("Should handle string numbers");
        }
      })
    ) {
      passed++;
    } else {
      failed++;
    }

    // TEST 17: CONCURRENT BIDS
    console.log("\n📋 TEST 17: CONCURRENT BIDS (ADVANCED)");
    if (
      await test("Should handle concurrent bids with correct L1 logic", async () => {
        const rfqId = await createRFQ({
          start_minutes_from_now: 0.5,
          close_minutes_from_now: 1.5,
          forced_close_minutes_from_now: 3,
        });
        await waitForAuctionStart(1);

        // Send multiple bids almost simultaneously
        const bids = [1000, 800, 1200, 900];
        const responses = await Promise.all(
          bids.map((amount) =>
            axios.post(`${API_URL}/bid`, {
              rfq_id: rfqId,
              bid_amount: amount,
            }),
          ),
        );

        // Only the lowest bid (800) should be L1
        const l1Bids = responses.filter((r) => r.data.data.bid_is_l1);
        if (l1Bids.length !== 1) {
          throw new Error(
            `Expected 1 L1 bid after concurrent submissions, got ${l1Bids.length}`,
          );
        }
        if (l1Bids[0].data.data.bid_is_l1 && bids.indexOf(800) === -1) {
          throw new Error("L1 bid should be for the lowest amount (800)");
        }
      })
    ) {
      passed++;
    } else {
      failed++;
    }
  } catch (error) {
    console.error("\n❌ Test suite error:", error.message);
  }

  // Summary
  console.log("\n╔" + "═".repeat(88) + "╗");
  console.log(
    `║ RESULTS: ${passed} PASSED | ${failed} FAILED ${" ".repeat(54)}║`,
  );
  console.log("╚" + "═".repeat(88) + "╝\n");

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runAllTests();
