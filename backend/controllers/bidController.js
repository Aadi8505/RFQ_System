const { pool } = require("../config/db");

const placeBid = async (req, res) => {
  try {
    const { rfq_id, bid_amount } = req.body;

    // Validate required fields
    if (!rfq_id || !bid_amount) {
      return res.status(400).json({
        error: "Missing required fields: rfq_id, bid_amount",
      });
    }

    // Fetch RFQ from database
    const fetchQuery = "SELECT * FROM rfq WHERE id = $1";
    const fetchResult = await pool.query(fetchQuery, [rfq_id]);

    if (fetchResult.rows.length === 0) {
      return res.status(404).json({
        error: "RFQ not found",
      });
    }

    const rfq = fetchResult.rows[0];
    const now = new Date();
    const forcedCloseTime = new Date(rfq.forced_close_time);
    const bidCloseTime = new Date(rfq.bid_close_time);

    // Check if auction is still active
    if (now >= forcedCloseTime) {
      return res.status(400).json({
        error: "Auction has reached forced close time",
      });
    }

    // Check if we need to extend bid_close_time
    let newBidCloseTime = bidCloseTime;
    const timeDiffMinutes = (bidCloseTime - now) / (1000 * 60);

    if (timeDiffMinutes <= rfq.trigger_window && now < forcedCloseTime) {
      // Extend bid_close_time
      newBidCloseTime = new Date(
        bidCloseTime.getTime() + rfq.extension_duration * 60000,
      );

      // Make sure it doesn't exceed forced_close_time
      if (newBidCloseTime > forcedCloseTime) {
        newBidCloseTime = forcedCloseTime;
      }

      // Update RFQ with new bid_close_time
      const updateQuery =
        "UPDATE rfq SET bid_close_time = $1 WHERE id = $2 RETURNING *";
      const updateResult = await pool.query(updateQuery, [
        newBidCloseTime,
        rfq_id,
      ]);

      return res.status(200).json({
        message: "Bid placed and auction extended",
        rfq: updateResult.rows[0],
      });
    }

    // No extension needed
    res.status(200).json({
      message: "Bid placed",
      rfq: rfq,
    });
  } catch (error) {
    console.error("Error placing bid:", error.message);
    res.status(500).json({
      error: "Failed to place bid",
      details: error.message,
    });
  }
};

module.exports = {
  placeBid,
};
