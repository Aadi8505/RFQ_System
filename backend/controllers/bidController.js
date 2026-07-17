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
      tnc_extra_charges,
    } = req.body;

    const user_id = req.user.id; // From JWT

    // STEP 1: Validate input
    if (!rfq_id || bid_amount === null || bid_amount === undefined) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: rfq_id, bid_amount",
      });
    }

    const parsedBidAmount = parseFloat(bid_amount);
    if (isNaN(parsedBidAmount) || parsedBidAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid bid amount: must be a positive number",
      });
    }

    // STEP 2: Fetch RFQ
    const fetchResult = await pool.query("SELECT * FROM rfq WHERE id = $1", [rfq_id]);
    if (fetchResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Auction not found" });
    }

    const rfq = fetchResult.rows[0];

    // STEP 2.5: BLOCK SELF-BIDDING — user cannot bid on their own auction
    if (rfq.created_by === user_id) {
      return res.status(403).json({
        success: false,
        message: "You cannot bid on your own service auction.",
      });
    }

    // STEP 3: Get current time from database
    const nowResult = await pool.query("SELECT NOW() as current_time");
    const now = new Date(nowResult.rows[0].current_time);

    const bidStartTime = new Date(rfq.bid_start_time);
    const forcedCloseTime = new Date(rfq.forced_close_time);
    const bidCloseTime = new Date(rfq.bid_close_time);

    // STEP 4: Validate auction timing
    if (now >= forcedCloseTime) {
      return res.status(400).json({
        success: false,
        message: "Auction force-closed. No more bids allowed.",
      });
    }

    if (now < bidStartTime) {
      return res.status(400).json({
        success: false,
        message: "Auction has not started yet",
      });
    }

    if (now >= bidCloseTime) {
      return res.status(400).json({
        success: false,
        message: "Auction has closed",
      });
    }

    // STEP 5: Fetch existing bids
    const existingBidsResult = await pool.query(
      "SELECT id, bid_amount FROM bids WHERE rfq_id = $1 ORDER BY bid_amount ASC, created_at ASC",
      [rfq_id]
    );
    const existingBids = existingBidsResult.rows;

    const currentLowestBid =
      existingBids.length > 0 ? parseFloat(existingBids[0].bid_amount) : null;

    // STEP 6: Determine L1 and rank change
    const isNewL1 = currentLowestBid === null || parsedBidAmount < currentLowestBid;

    let anyRankChange = false;
    if (existingBids.length > 0) {
      const highestExistingBid = parseFloat(existingBids[existingBids.length - 1].bid_amount);
      anyRankChange = parsedBidAmount < highestExistingBid;
    }

    // STEP 7: Insert new bid with user_id
    const insertBidQuery = `
      INSERT INTO bids (rfq_id, user_id, bid_amount, carrier_name, freight_charges, origin_charges, destination_charges, transit_time, validity, created_at, tnc_extra_charges)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`;
    const insertResult = await pool.query(insertBidQuery, [
      rfq_id,
      user_id,
      parsedBidAmount,
      carrier_name || null,
      freight_charges || 0,
      origin_charges || 0,
      destination_charges || 0,
      transit_time || null,
      validity || null,
      now,
      tnc_extra_charges || null,
    ]);
    const newBid = insertResult.rows[0];

    // STEP 7.5: Audit trail
    const bidderName = carrier_name || req.user.name || "Unknown";
    const bidAuditAction = `Bid placed: ₹${parsedBidAmount} by ${bidderName}${isNewL1 ? " (New L1)" : ""}`;
    await pool.query(
      `INSERT INTO rfq_audit (rfq_id, action, old_bid_close_time, new_bid_close_time, changed_by, changed_at)
       VALUES ($1, $2, NULL, NULL, $3, CURRENT_TIMESTAMP)`,
      [rfq_id, bidAuditAction, bidderName]
    );

    // STEP 8-10: Extension logic (unchanged from original)
    const triggerWindowMs = rfq.trigger_window * 60000;
    const triggerStartTime = new Date(bidCloseTime.getTime() - triggerWindowMs);
    const withinTriggerWindow = now >= triggerStartTime;

    let shouldExtend = false;
    let extensionReason = "";

    if (withinTriggerWindow) {
      switch (rfq.trigger_type) {
        case "ANY_BID":
          shouldExtend = true;
          extensionReason = `Bid received in last ${rfq.trigger_window} minutes`;
          break;
        case "ANY_RANK_CHANGE":
          if (anyRankChange) {
            shouldExtend = true;
            extensionReason = `Supplier rank change in last ${rfq.trigger_window} minutes`;
          }
          break;
        case "L1_CHANGE":
          if (isNewL1) {
            shouldExtend = true;
            extensionReason = `L1 (lowest bidder) changed in last ${rfq.trigger_window} minutes`;
          }
          break;
      }
    }

    let updatedRFQ = rfq;

    if (shouldExtend) {
      const extensionMs = rfq.extension_duration * 60000;
      let newBidCloseTime = new Date(bidCloseTime.getTime() + extensionMs);

      if (newBidCloseTime > forcedCloseTime) {
        newBidCloseTime = new Date(forcedCloseTime.getTime());
      }

      const updateResult = await pool.query(
        "UPDATE rfq SET bid_close_time = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
        [newBidCloseTime, rfq_id]
      );
      updatedRFQ = updateResult.rows[0];

      await pool.query(
        `INSERT INTO rfq_audit (rfq_id, action, old_bid_close_time, new_bid_close_time, changed_by, changed_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [rfq_id, extensionReason, bidCloseTime, newBidCloseTime, "system"]
      );
    }

    // STEP 11: Updated rankings
    const rankingsResult = await pool.query(
      `SELECT b.id, b.bid_amount, b.carrier_name, b.user_id, b.freight_charges, b.origin_charges, 
              b.destination_charges, b.transit_time, b.validity, b.created_at, b.tnc_extra_charges,
              u.name as bidder_name
       FROM bids b LEFT JOIN users u ON b.user_id = u.id
       WHERE b.rfq_id = $1 ORDER BY b.bid_amount ASC, b.created_at ASC`,
      [rfq_id]
    );
    const rankings = rankingsResult.rows.map((bid, index) => ({
      rank: `L${index + 1}`,
      bid_id: bid.id,
      user_id: bid.user_id,
      bid_amount: parseFloat(bid.bid_amount),
      carrier_name: bid.carrier_name,
      bidder_name: bid.bidder_name,
      freight_charges: bid.freight_charges ? parseFloat(bid.freight_charges) : 0,
      origin_charges: bid.origin_charges ? parseFloat(bid.origin_charges) : 0,
      destination_charges: bid.destination_charges ? parseFloat(bid.destination_charges) : 0,
      transit_time: bid.transit_time,
      validity: bid.validity,
      tnc_extra_charges: bid.tnc_extra_charges,
      placed_at: bid.created_at,
    }));

    const newBidRank = rankings.find((r) => r.bid_id === newBid.id);

    // Emit socket event for real-time bid updates
    try {
      const { getIO } = require("../config/socket");
      const io = getIO();
      io.to(`rfq-${rfq_id}`).emit("bid-updated", {
        rfq_id,
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
      });
    } catch (err) {
      console.error("Socket emit error on bid-placed:", err.message);
    }

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
    res.status(500).json({ success: false, message: "Failed to place bid", error: error.message });
  }
};

module.exports = { placeBid };
