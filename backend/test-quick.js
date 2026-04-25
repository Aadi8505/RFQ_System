// Quick test script to verify the full bidding flow
const http = require("http");

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: "localhost",
      port: 5000,
      path: `/api${path}`,
      method,
      headers: { "Content-Type": "application/json" },
    };
    const req = http.request(opts, (res) => {
      let chunks = "";
      res.on("data", (c) => (chunks += c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(chunks) });
        } catch {
          resolve({ status: res.statusCode, body: chunks });
        }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("=== RFQ BRITISH AUCTION - FULL FLOW TEST ===\n");

  // STEP 1: Create RFQ
  // close in 2 min, forced close in 10 min, trigger window = 5 min (covers the close time)
  // This means bids placed anytime will be in the trigger window since close is 2 min away and window is 5 min
  console.log("📝 STEP 1: Creating RFQ...");
  const createRes = await request("POST", "/rfq", {
    name: "Test British Auction",
    start_minutes_from_now: 0,
    close_minutes_from_now: 2,
    forced_close_minutes_from_now: 10,
    service_date: "2026-05-01T00:00:00Z",
    trigger_window: 5,
    extension_duration: 2,
    trigger_type: "ANY_BID",
  });

  console.log("  Status:", createRes.status);
  console.log("  Success:", createRes.body.success);
  console.log("  RFQ ID:", createRes.body.data?.id);
  console.log("  Server Time:", createRes.body.server_time);
  console.log("  Bid Start:", createRes.body.data?.bid_start_time);
  console.log("  Bid Close:", createRes.body.data?.bid_close_time);
  console.log("  Forced Close:", createRes.body.data?.forced_close_time);
  console.log("  Trigger Type:", createRes.body.data?.trigger_type);
  console.log();

  if (!createRes.body.success) {
    console.log("❌ Failed to create RFQ. Aborting.");
    process.exit(1);
  }

  const rfqId = createRes.body.data.id;

  // STEP 2: Place first bid (should be L1, should extend auction)
  console.log("💰 STEP 2: Placing first bid (5000)...");
  const bid1 = await request("POST", "/bid", {
    rfq_id: rfqId,
    bid_amount: 5000,
  });

  console.log("  Status:", bid1.status);
  console.log("  Message:", bid1.body.message);
  console.log("  Is L1:", bid1.body.data?.bid?.is_l1);
  console.log("  Rank:", bid1.body.data?.bid?.rank);
  console.log("  Extended:", bid1.body.data?.extension?.extended);
  console.log("  Extension Reason:", bid1.body.data?.extension?.reason || "N/A");
  console.log("  New Close Time:", bid1.body.data?.rfq?.bid_close_time);
  console.log();

  // STEP 3: Place second bid (higher, should NOT be L1)
  console.log("💰 STEP 3: Placing second bid (7000 - higher, not L1)...");
  const bid2 = await request("POST", "/bid", {
    rfq_id: rfqId,
    bid_amount: 7000,
  });

  console.log("  Status:", bid2.status);
  console.log("  Message:", bid2.body.message);
  console.log("  Is L1:", bid2.body.data?.bid?.is_l1);
  console.log("  Rank:", bid2.body.data?.bid?.rank);
  console.log("  Extended:", bid2.body.data?.extension?.extended);
  console.log("  Rankings:", JSON.stringify(bid2.body.data?.rankings));
  console.log();

  // STEP 4: Place third bid (lowest, should be new L1)
  console.log("💰 STEP 4: Placing third bid (3000 - new L1!)...");
  const bid3 = await request("POST", "/bid", {
    rfq_id: rfqId,
    bid_amount: 3000,
  });

  console.log("  Status:", bid3.status);
  console.log("  Message:", bid3.body.message);
  console.log("  Is L1:", bid3.body.data?.bid?.is_l1);
  console.log("  Rank:", bid3.body.data?.bid?.rank);
  console.log("  Extended:", bid3.body.data?.extension?.extended);
  console.log("  Rankings:", JSON.stringify(bid3.body.data?.rankings));
  console.log();

  // STEP 5: Get RFQ detail to verify
  console.log("📋 STEP 5: Getting RFQ details...");
  const detail = await request("GET", `/rfq/${rfqId}`);

  console.log("  Status:", detail.body.data?.rfq?.status);
  console.log("  Auction Config:", JSON.stringify(detail.body.data?.auction_config));
  console.log("  Rankings:");
  detail.body.data?.rankings?.forEach((r) => {
    console.log(`    ${r.rank}: $${r.bid_amount}`);
  });
  console.log("  Activity Log:");
  detail.body.data?.activity_log?.forEach((log) => {
    console.log(`    - ${log.action} | ${log.old_close_time} → ${log.new_close_time}`);
  });
  console.log();

  // STEP 6: Get all RFQs listing
  console.log("📋 STEP 6: Getting all RFQs listing...");
  const listing = await request("GET", "/rfqs");

  listing.body.data?.forEach((rfq) => {
    console.log(`  ID: ${rfq.id} | ${rfq.name} | Status: ${rfq.status} | Lowest: $${rfq.current_lowest_bid} | Bids: ${rfq.total_bids}`);
  });
  console.log();

  // STEP 7: Test L1_CHANGE trigger type
  console.log("📝 STEP 7: Creating RFQ with L1_CHANGE trigger...");
  const createRes2 = await request("POST", "/rfq", {
    name: "L1 Change Auction",
    start_minutes_from_now: 0,
    close_minutes_from_now: 2,
    forced_close_minutes_from_now: 10,
    service_date: "2026-05-01T00:00:00Z",
    trigger_window: 5,
    extension_duration: 2,
    trigger_type: "L1_CHANGE",
  });

  const rfqId2 = createRes2.body.data?.id;
  console.log("  RFQ ID:", rfqId2);

  // Place first bid — L1 by default
  console.log("💰 Placing first bid (5000) on L1_CHANGE RFQ...");
  const bid4 = await request("POST", "/bid", {
    rfq_id: rfqId2,
    bid_amount: 5000,
  });
  console.log("  Message:", bid4.body.message);
  console.log("  Is L1:", bid4.body.data?.bid?.is_l1);
  console.log("  Extended:", bid4.body.data?.extension?.extended);
  // First bid is L1 but there's no "change" — wait, it IS L1 since there was no previous L1
  // In our logic isNewL1 = true when currentLowestBid is null, so it WILL extend. That's correct.
  console.log();

  // Place higher bid — NOT L1, should NOT extend with L1_CHANGE
  console.log("💰 Placing higher bid (8000) on L1_CHANGE RFQ (should NOT extend)...");
  const bid5 = await request("POST", "/bid", {
    rfq_id: rfqId2,
    bid_amount: 8000,
  });
  console.log("  Message:", bid5.body.message);
  console.log("  Is L1:", bid5.body.data?.bid?.is_l1);
  console.log("  Extended:", bid5.body.data?.extension?.extended);
  console.log();

  // Place lower bid — new L1, SHOULD extend with L1_CHANGE
  console.log("💰 Placing lower bid (3000) on L1_CHANGE RFQ (SHOULD extend — L1 changed)...");
  const bid6 = await request("POST", "/bid", {
    rfq_id: rfqId2,
    bid_amount: 3000,
  });
  console.log("  Message:", bid6.body.message);
  console.log("  Is L1:", bid6.body.data?.bid?.is_l1);
  console.log("  Extended:", bid6.body.data?.extension?.extended);
  console.log("  Extension Reason:", bid6.body.data?.extension?.reason || "N/A");
  console.log();

  // STEP 8: Test ANY_RANK_CHANGE trigger type
  console.log("📝 STEP 8: Creating RFQ with ANY_RANK_CHANGE trigger...");
  const createRes3 = await request("POST", "/rfq", {
    name: "Rank Change Auction",
    start_minutes_from_now: 0,
    close_minutes_from_now: 2,
    forced_close_minutes_from_now: 10,
    service_date: "2026-05-01T00:00:00Z",
    trigger_window: 5,
    extension_duration: 2,
    trigger_type: "ANY_RANK_CHANGE",
  });

  const rfqId3 = createRes3.body.data?.id;
  console.log("  RFQ ID:", rfqId3);

  // Place first bid
  console.log("💰 Placing first bid (5000) — no rank change (first bid)...");
  const bid7 = await request("POST", "/bid", {
    rfq_id: rfqId3,
    bid_amount: 5000,
  });
  console.log("  Message:", bid7.body.message);
  console.log("  Extended:", bid7.body.data?.extension?.extended, "(expected: false — first bid, no ranks to change)");
  console.log();

  // Place HIGHER bid — no rank change
  console.log("💰 Placing higher bid (8000) — no rank change (goes to bottom)...");
  const bid8 = await request("POST", "/bid", {
    rfq_id: rfqId3,
    bid_amount: 8000,
  });
  console.log("  Message:", bid8.body.message);
  console.log("  Extended:", bid8.body.data?.extension?.extended, "(expected: false — 8000 goes below 5000, no existing bid pushed)");
  console.log();

  // Place bid between existing — rank change!
  console.log("💰 Placing bid (6000) between existing — pushes 8000 down...");
  const bid9 = await request("POST", "/bid", {
    rfq_id: rfqId3,
    bid_amount: 6000,
  });
  console.log("  Message:", bid9.body.message);
  console.log("  Extended:", bid9.body.data?.extension?.extended, "(expected: true — 6000 pushes 8000's rank down)");
  console.log("  Extension Reason:", bid9.body.data?.extension?.reason || "N/A");
  console.log();

  console.log("=== ALL TESTS COMPLETE ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
