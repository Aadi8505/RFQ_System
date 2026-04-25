const { pool } = require("../config/db");

const placeBid = async (req, res) => {
  try {
    const {
      rfq_id,
      bid_amount,
      carrier_name,
      freight_charges,
      origin_charges,
      destination_charges,
      transit_time,
      validity,
    } = req.body;

    // STEP 1: Validate input
    if (!rfq_id || bid_amount === null || bid_amount === undefined) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: rfq_id, bid_amount",
        error: null,
      });
    }

    // STEP 1.5: Validate bid amount is positive number
    const parsedBidAmount = parseFloat(bid_amount);
    if (isNaN(parsedBidAmount) || parsedBidAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid bid amount: must be a positive number",
        error: null,
      });
    }

    // STEP 2: Fetch RFQ by id
    const fetchQuery = "SELECT * FROM rfq WHERE id = $1";
    const fetchResult = await pool.query(fetchQuery, [rfq_id]);

    if (fetchResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "RFQ not found",
        error: null,
      });
    }

    const rfq = fetchResult.rows[0];

    // STEP 3: Get current time from database (avoids timezone issues)
    const nowQuery = "SELECT NOW() as current_time";
    const nowResult = await pool.query(nowQuery);
    const now = new Date(nowResult.rows[0].current_time);

    const bidStartTime = new Date(rfq.bid_start_time);
    const forcedCloseTime = new Date(rfq.forced_close_time);
    const bidCloseTime = new Date(rfq.bid_close_time);

    // STEP 4: Validate auction timing
    // Check 1: Has the auction been force-closed?
    if (now >= forcedCloseTime) {
      return res.status(400).json({
        success: false,
        message: "Auction force-closed. No more bids allowed.",
        error: null,
      });
    }

    // Check 2: Has the auction not started yet?
    if (now < bidStartTime) {
      return res.status(400).json({
        success: false,
        message: "Auction has not started yet",
        error: null,
      });
    }

    // Check 3: Has the normal bid close time passed? (critical fix)
    if (now >= bidCloseTime) {
      return res.status(400).json({
        success: false,
        message: "Auction has closed",
        error: null,
      });
    }

    // STEP 5: Fetch ALL existing bids (sorted by amount ASC) BEFORE inserting
    const existingBidsQuery =
      "SELECT id, bid_amount FROM bids WHERE rfq_id = $1 ORDER BY bid_amount ASC, created_at ASC";
    const existingBidsResult = await pool.query(existingBidsQuery, [rfq_id]);
    const existingBids = existingBidsResult.rows;

    // Current L1 (lowest) bid before this new bid
    const currentLowestBid =
      existingBids.length > 0 ? parseFloat(existingBids[0].bid_amount) : null;

    // STEP 6: Determine if new bid becomes L1
    const isNewL1 =
      currentLowestBid === null || parsedBidAmount < currentLowestBid;

    // STEP 6.5: Determine if any rank changes occur
    // A rank change happens if the new bid "slots in" anywhere in the existing ranking
    // i.e., at least one existing bid gets pushed down
    let anyRankChange = false;
    if (existingBids.length === 0) {
      // First bid — no rank change (no existing ranking to disrupt)
      anyRankChange = false;
    } else {
      // If the new bid is lower than ANY existing bid, it pushes that bid's rank down
      // This means any bid amount < the highest existing bid causes a rank change
      const highestExistingBid = parseFloat(
        existingBids[existingBids.length - 1].bid_amount,
      );
      anyRankChange = parsedBidAmount < highestExistingBid;
      // Also, if the new bid equals an existing bid, the existing one gets pushed
      // down because the newer bid at same price comes after (no rank change for ties)
      // Actually for ties, we consider it a rank change only if strictly less
      // Edge case: if new bid == existing bid, ranks don't change (they share rank)
    }

    // STEP 7: Insert new bid into bids table (with quote fields)
    const insertBidQuery = `
      INSERT INTO bids (rfq_id, bid_amount, carrier_name, freight_charges, origin_charges, destination_charges, transit_time, validity, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`;
    const insertResult = await pool.query(insertBidQuery, [
      rfq_id,
      parsedBidAmount,
      carrier_name || null,
      freight_charges || 0,
      origin_charges || 0,
      destination_charges || 0,
      transit_time || null,
      validity || null,
      now,
    ]);
    const newBid = insertResult.rows[0];

    // STEP 7.5: Log bid submission in audit trail
    const bidAuditAction = `Bid placed: ₹${parsedBidAmount} by ${carrier_name || "Unknown"}${isNewL1 ? " (New L1)" : ""}`;
    const bidAuditQuery = `
      INSERT INTO rfq_audit (rfq_id, action, old_bid_close_time, new_bid_close_time, changed_by, changed_at)
      VALUES ($1, $2, NULL, NULL, $3, CURRENT_TIMESTAMP)
    `;
    await pool.query(bidAuditQuery, [
      rfq_id,
      bidAuditAction,
      carrier_name || "supplier",
    ]);

    // STEP 8: Determine trigger window
    const triggerWindowMs = rfq.trigger_window * 60000; // convert minutes to ms
    const triggerStartTime = new Date(bidCloseTime.getTime() - triggerWindowMs);
    const withinTriggerWindow = now >= triggerStartTime;

    // STEP 9: Decide whether to extend
    let shouldExtend = false;
    let extensionReason = "";

    if (withinTriggerWindow) {
      switch (rfq.trigger_type) {
        case "ANY_BID":
          // Any bid in the trigger window causes extension
          shouldExtend = true;
          extensionReason = `Bid received in last ${rfq.trigger_window} minutes`;
          break;

        case "ANY_RANK_CHANGE":
          // Extension only if any supplier ranking changed
          if (anyRankChange) {
            shouldExtend = true;
            extensionReason = `Supplier rank change in last ${rfq.trigger_window} minutes`;
          }
          break;

        case "L1_CHANGE":
          // Extension only if the lowest bidder (L1) changed
          if (isNewL1) {
            shouldExtend = true;
            extensionReason = `L1 (lowest bidder) changed in last ${rfq.trigger_window} minutes`;
          }
          break;

        default:
          break;
      }
    }

    // STEP 10: If extending, update RFQ and log audit
    let updatedRFQ = rfq;

    if (shouldExtend) {
      // Calculate new bid close time
      const extensionMs = rfq.extension_duration * 60000;
      let newBidCloseTime = new Date(bidCloseTime.getTime() + extensionMs);

      // Cap at forced_close_time — auction must NEVER extend beyond forced close
      if (newBidCloseTime > forcedCloseTime) {
        newBidCloseTime = new Date(forcedCloseTime.getTime());
      }

      // Update RFQ with new bid_close_time
      const updateQuery =
        "UPDATE rfq SET bid_close_time = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *";
      const updateResult = await pool.query(updateQuery, [
        newBidCloseTime,
        rfq_id,
      ]);
      updatedRFQ = updateResult.rows[0];

      // Write audit log
      const auditQuery = `
        INSERT INTO rfq_audit (rfq_id, action, old_bid_close_time, new_bid_close_time, changed_by, changed_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      `;
      await pool.query(auditQuery, [
        rfq_id,
        extensionReason,
        bidCloseTime,
        newBidCloseTime,
        "system",
      ]);
    }

    // STEP 11: Get updated rankings after inserting the new bid
    const rankingsQuery =
      "SELECT id, bid_amount, carrier_name, freight_charges, origin_charges, destination_charges, transit_time, validity, created_at FROM bids WHERE rfq_id = $1 ORDER BY bid_amount ASC, created_at ASC";
    const rankingsResult = await pool.query(rankingsQuery, [rfq_id]);
    const rankings = rankingsResult.rows.map((bid, index) => ({
      rank: `L${index + 1}`,
      bid_id: bid.id,
      bid_amount: parseFloat(bid.bid_amount),
      carrier_name: bid.carrier_name,
      freight_charges: bid.freight_charges ? parseFloat(bid.freight_charges) : 0,
      origin_charges: bid.origin_charges ? parseFloat(bid.origin_charges) : 0,
      destination_charges: bid.destination_charges ? parseFloat(bid.destination_charges) : 0,
      transit_time: bid.transit_time,
      validity: bid.validity,
      placed_at: bid.created_at,
    }));

    // Find the new bid's rank
    const newBidRank = rankings.find((r) => r.bid_id === newBid.id);

    // STEP 12: Return response
    return res.status(200).json({
      success: true,
      message: shouldExtend ? "Bid placed and auction extended" : "Bid placed",
      data: {
        bid: {
          id: newBid.id,
          bid_amount: parsedBidAmount,
          rank: newBidRank ? newBidRank.rank : "L1",
          is_l1: isNewL1,
        },
        extension: shouldExtend
          ? {
              extended: true,
              reason: extensionReason,
              old_close_time: bidCloseTime,
              new_close_time: updatedRFQ.bid_close_time,
            }
          : { extended: false },
        rfq: {
          id: updatedRFQ.id,
          name: updatedRFQ.name,
          bid_close_time: updatedRFQ.bid_close_time,
          forced_close_time: updatedRFQ.forced_close_time,
        },
        rankings: rankings,
      },
    });
  } catch (error) {
    console.error("Error placing bid:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to place bid",
      error: error.message,
    });
  }
};

module.exports = {
  placeBid,
};
