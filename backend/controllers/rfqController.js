const { pool } = require("../config/db");

// Create a new RFQ
const createRFQ = async (req, res) => {
  try {
    const {
      name,
      start_minutes_from_now,
      close_minutes_from_now,
      forced_close_minutes_from_now,
      service_date,
      trigger_window,
      extension_duration,
      trigger_type,
      // Also accept direct timestamp format
      bid_start_time,
      bid_close_time,
      forced_close_time,
    } = req.body;

    // Check required fields - support both formats
    const usingNewFormat =
      start_minutes_from_now !== undefined ||
      close_minutes_from_now !== undefined ||
      forced_close_minutes_from_now !== undefined;

    const usingOldFormat =
      bid_start_time !== undefined ||
      bid_close_time !== undefined ||
      forced_close_time !== undefined;

    // Get current database time for ALL calculations (avoids timezone issues)
    const nowResult = await pool.query("SELECT NOW() as now");
    const dbNow = new Date(nowResult.rows[0].now);

    let startTime, closeTime, forcedTime;

    if (usingNewFormat) {
      // Minutes-from-now format (recommended — no timezone issues)
      if (
        start_minutes_from_now === undefined ||
        close_minutes_from_now === undefined ||
        forced_close_minutes_from_now === undefined
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Missing required fields: start_minutes_from_now, close_minutes_from_now, forced_close_minutes_from_now",
          error: null,
        });
      }

      startTime = new Date(
        dbNow.getTime() + start_minutes_from_now * 60000,
      );
      closeTime = new Date(
        dbNow.getTime() + close_minutes_from_now * 60000,
      );
      forcedTime = new Date(
        dbNow.getTime() + forced_close_minutes_from_now * 60000,
      );
    } else if (usingOldFormat) {
      // Direct timestamp format — use PostgreSQL to parse to avoid JS timezone bugs
      if (!bid_start_time || !bid_close_time || !forced_close_time) {
        return res.status(400).json({
          success: false,
          message:
            "Missing required fields: bid_start_time, bid_close_time, forced_close_time",
          error: null,
        });
      }

      // Let PostgreSQL parse the timestamps to avoid JavaScript timezone conversion issues
      const parseResult = await pool.query(
        `SELECT 
          $1::timestamptz as start_time,
          $2::timestamptz as close_time,
          $3::timestamptz as forced_time`,
        [bid_start_time, bid_close_time, forced_close_time],
      );

      startTime = new Date(parseResult.rows[0].start_time);
      closeTime = new Date(parseResult.rows[0].close_time);
      forcedTime = new Date(parseResult.rows[0].forced_time);
    } else {
      return res.status(400).json({
        success: false,
        message:
          "Must provide either minutes-from-now format or ISO timestamp format",
        error: null,
      });
    }

    if (!name || !service_date) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: name, service_date",
        error: null,
      });
    }

    // Validate time ordering
    if (startTime >= closeTime) {
      return res.status(400).json({
        success: false,
        message: "bid_start_time must be before bid_close_time",
        error: null,
      });
    }

    // Validation Rule: Forced Bid Close Time must always be greater than Bid Close Time
    if (closeTime >= forcedTime) {
      return res.status(400).json({
        success: false,
        message: "bid_close_time must be before forced_close_time",
        error: null,
      });
    }

    // Validate trigger_type if provided
    const validTriggerTypes = ["ANY_BID", "ANY_RANK_CHANGE", "L1_CHANGE"];
    const selectedTriggerType = trigger_type || "ANY_BID";
    if (!validTriggerTypes.includes(selectedTriggerType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid trigger_type. Must be one of: ${validTriggerTypes.join(", ")}`,
        error: null,
      });
    }

    // Insert RFQ into database
    const query = `
      INSERT INTO rfq (name, bid_start_time, bid_close_time, forced_close_time, service_date, trigger_window, extension_duration, trigger_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;

    const values = [
      name,
      startTime,
      closeTime,
      forcedTime,
      service_date,
      trigger_window || 10,
      extension_duration || 5,
      selectedTriggerType,
    ];

    const result = await pool.query(query, values);

    res.status(201).json({
      success: true,
      message: "RFQ created successfully",
      data: result.rows[0],
      server_time: dbNow,
    });
  } catch (error) {
    console.error("Error creating RFQ:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to create RFQ",
      error: error.message,
    });
  }
};

// Get all RFQs (Auction Listing Page)
const getRFQs = async (req, res) => {
  try {
    const nowResult = await pool.query("SELECT NOW() as now");
    const dbNow = new Date(nowResult.rows[0].now);

    const query = `
      SELECT 
        r.id,
        r.name,
        r.bid_start_time,
        r.bid_close_time,
        r.forced_close_time,
        r.service_date,
        r.trigger_window,
        r.extension_duration,
        r.trigger_type,
        r.created_at,
        MIN(b.bid_amount) as current_lowest_bid,
        COUNT(b.id) as total_bids
      FROM rfq r
      LEFT JOIN bids b ON r.id = b.rfq_id
      GROUP BY r.id
      ORDER BY r.created_at DESC;
    `;

    const result = await pool.query(query);

    // Add computed status for each RFQ
    const rfqs = result.rows.map((rfq) => {
      const bidStartTime = new Date(rfq.bid_start_time);
      const bidCloseTime = new Date(rfq.bid_close_time);
      const forcedCloseTime = new Date(rfq.forced_close_time);

      let status;
      if (dbNow >= forcedCloseTime) {
        status = "Force Closed";
      } else if (dbNow >= bidCloseTime) {
        status = "Closed";
      } else if (dbNow >= bidStartTime) {
        status = "Active";
      } else {
        status = "Upcoming";
      }

      return {
        ...rfq,
        current_lowest_bid: rfq.current_lowest_bid
          ? parseFloat(rfq.current_lowest_bid)
          : null,
        total_bids: parseInt(rfq.total_bids),
        status,
      };
    });

    res.status(200).json({
      success: true,
      data: rfqs,
      server_time: dbNow,
    });
  } catch (error) {
    console.error("Error fetching RFQs:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch RFQs",
      error: error.message,
    });
  }
};

// Get single RFQ with bids, rankings, and audit log (Auction Details Page)
const getRFQById = async (req, res) => {
  try {
    const { id } = req.params;

    const nowResult = await pool.query("SELECT NOW() as now");
    const dbNow = new Date(nowResult.rows[0].now);

    // Fetch RFQ
    const rfqResult = await pool.query("SELECT * FROM rfq WHERE id = $1", [id]);

    if (rfqResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "RFQ not found",
        error: null,
      });
    }

    const rfq = rfqResult.rows[0];

    // Determine status
    const bidStartTime = new Date(rfq.bid_start_time);
    const bidCloseTime = new Date(rfq.bid_close_time);
    const forcedCloseTime = new Date(rfq.forced_close_time);

    let status;
    if (dbNow >= forcedCloseTime) {
      status = "Force Closed";
    } else if (dbNow >= bidCloseTime) {
      status = "Closed";
    } else if (dbNow >= bidStartTime) {
      status = "Active";
    } else {
      status = "Upcoming";
    }

    // Fetch all bids sorted by price (rankings: L1, L2, L3...)
    const bidsResult = await pool.query(
      "SELECT * FROM bids WHERE rfq_id = $1 ORDER BY bid_amount ASC, created_at ASC",
      [id],
    );

    const rankings = bidsResult.rows.map((bid, index) => ({
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

    // Fetch audit log (activity log showing extensions and reasons)
    const auditResult = await pool.query(
      "SELECT * FROM rfq_audit WHERE rfq_id = $1 ORDER BY changed_at DESC",
      [id],
    );

    res.status(200).json({
      success: true,
      data: {
        rfq: {
          ...rfq,
          status,
        },
        auction_config: {
          trigger_window: rfq.trigger_window,
          extension_duration: rfq.extension_duration,
          trigger_type: rfq.trigger_type,
        },
        rankings,
        activity_log: auditResult.rows.map((log) => ({
          action: log.action,
          old_close_time: log.old_bid_close_time,
          new_close_time: log.new_bid_close_time,
          changed_by: log.changed_by,
          changed_at: log.changed_at,
        })),
      },
      server_time: dbNow,
    });
  } catch (error) {
    console.error("Error fetching RFQ:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch RFQ",
      error: error.message,
    });
  }
};

module.exports = {
  createRFQ,
  getRFQs,
  getRFQById,
};
