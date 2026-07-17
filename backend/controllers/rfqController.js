const { pool } = require("../config/db");

// ─── Create a new RFQ (user only) ───────────────────────────────────────────
const createRFQ = async (req, res) => {
  try {
    const {
      name,
      description,
      category_id,
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

    const created_by = req.user.id; // From JWT — the logged-in user

    // Check required fields - support both formats
    const usingNewFormat =
      start_minutes_from_now !== undefined ||
      close_minutes_from_now !== undefined ||
      forced_close_minutes_from_now !== undefined;

    const usingOldFormat =
      bid_start_time !== undefined ||
      bid_close_time !== undefined ||
      forced_close_time !== undefined;

    // Get current database time for ALL calculations
    const nowResult = await pool.query("SELECT NOW() as now");
    const dbNow = new Date(nowResult.rows[0].now);

    let startTime, closeTime, forcedTime;

    if (usingNewFormat) {
      if (
        start_minutes_from_now === undefined ||
        close_minutes_from_now === undefined ||
        forced_close_minutes_from_now === undefined
      ) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: start_minutes_from_now, close_minutes_from_now, forced_close_minutes_from_now",
        });
      }

      startTime = new Date(dbNow.getTime() + start_minutes_from_now * 60000);
      closeTime = new Date(dbNow.getTime() + close_minutes_from_now * 60000);
      forcedTime = new Date(dbNow.getTime() + forced_close_minutes_from_now * 60000);
    } else if (usingOldFormat) {
      if (!bid_start_time || !bid_close_time || !forced_close_time) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: bid_start_time, bid_close_time, forced_close_time",
        });
      }

      const parseResult = await pool.query(
        `SELECT $1::timestamptz as start_time, $2::timestamptz as close_time, $3::timestamptz as forced_time`,
        [bid_start_time, bid_close_time, forced_close_time]
      );

      startTime = new Date(parseResult.rows[0].start_time);
      closeTime = new Date(parseResult.rows[0].close_time);
      forcedTime = new Date(parseResult.rows[0].forced_time);
    } else {
      return res.status(400).json({
        success: false,
        message: "Must provide either minutes-from-now format or ISO timestamp format",
      });
    }

    if (!name || !service_date) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: name, service_date",
      });
    }

    if (startTime >= closeTime) {
      return res.status(400).json({
        success: false,
        message: "bid_start_time must be before bid_close_time",
      });
    }

    if (closeTime >= forcedTime) {
      return res.status(400).json({
        success: false,
        message: "bid_close_time must be before forced_close_time",
      });
    }

    const validTriggerTypes = ["ANY_BID", "ANY_RANK_CHANGE", "L1_CHANGE"];
    const selectedTriggerType = trigger_type || "ANY_BID";
    if (!validTriggerTypes.includes(selectedTriggerType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid trigger_type. Must be one of: ${validTriggerTypes.join(", ")}`,
      });
    }

    // Validate category_id if provided
    if (category_id) {
      const catResult = await pool.query("SELECT id FROM categories WHERE id = $1 AND is_active = TRUE", [category_id]);
      if (catResult.rows.length === 0) {
        return res.status(400).json({ success: false, message: "Invalid category_id." });
      }
    }

    const query = `
      INSERT INTO rfq (name, description, category_id, created_by, bid_start_time, bid_close_time, forced_close_time, service_date, trigger_window, extension_duration, trigger_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;
    `;

    const values = [
      name,
      description || null,
      category_id || null,
      created_by,
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
      message: "Service auction created successfully",
      data: result.rows[0],
      server_time: dbNow,
    });
  } catch (error) {
    console.error("Error creating RFQ:", error.message);
    res.status(500).json({ success: false, message: "Failed to create auction", error: error.message });
  }
};

// ─── Get all RFQs (with category filter + search) ───────────────────────────
const getRFQs = async (req, res) => {
  try {
    const { category_id, search, status: filterStatus } = req.query;

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    // Filter by category
    if (category_id) {
      whereConditions.push(`r.category_id = $${paramIndex++}`);
      queryParams.push(parseInt(category_id));
    }

    // Search by name or description
    if (search) {
      whereConditions.push(`(r.name ILIKE $${paramIndex} OR r.description ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const query = `
      SELECT 
        r.id, r.name, r.description, r.category_id,
        r.created_by, r.bid_start_time, r.bid_close_time, r.forced_close_time,
        r.service_date, r.trigger_window, r.extension_duration, r.trigger_type,
        r.created_at,
        NOW() as db_now,
        c.name as category_name, c.icon as category_icon,
        u.name as posted_by_name, u.email as posted_by_email,
        MIN(b.bid_amount) as current_lowest_bid,
        COUNT(b.id) as total_bids
      FROM rfq r
      LEFT JOIN categories c ON r.category_id = c.id
      LEFT JOIN users u ON r.created_by = u.id
      LEFT JOIN bids b ON r.id = b.rfq_id
      ${whereClause}
      GROUP BY r.id, c.name, c.icon, u.name, u.email
      ORDER BY r.created_at DESC;
    `;

    const result = await pool.query(query, queryParams);
    const dbNow = result.rows.length > 0 ? new Date(result.rows[0].db_now) : new Date();

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
        current_lowest_bid: rfq.current_lowest_bid ? parseFloat(rfq.current_lowest_bid) : null,
        total_bids: parseInt(rfq.total_bids),
        status,
      };
    });

    // Optionally filter by computed status
    let filteredRfqs = rfqs;
    if (filterStatus) {
      filteredRfqs = rfqs.filter((r) => r.status.toLowerCase() === filterStatus.toLowerCase());
    }

    res.status(200).json({
      success: true,
      data: filteredRfqs,
      server_time: dbNow,
    });
  } catch (error) {
    console.error("Error fetching RFQs:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch auctions", error: error.message });
  }
};

// ─── Get single RFQ with full details ────────────────────────────────────────
const getRFQById = async (req, res) => {
  try {
    const { id } = req.params;

    const rfqResult = await pool.query(
      `SELECT r.*, NOW() as db_now, c.name as category_name, c.icon as category_icon,
              u.name as posted_by_name, u.email as posted_by_email, u.id as posted_by_id
       FROM rfq r
       LEFT JOIN categories c ON r.category_id = c.id
       LEFT JOIN users u ON r.created_by = u.id
       WHERE r.id = $1`,
      [id]
    );

    if (rfqResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Auction not found" });
    }

    const rfq = rfqResult.rows[0];
    const dbNow = new Date(rfq.db_now);

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

    // Fetch bids with user info
    const bidsResult = await pool.query(
      `SELECT b.*, u.name as bidder_name 
       FROM bids b 
       LEFT JOIN users u ON b.user_id = u.id
       WHERE b.rfq_id = $1 
       ORDER BY b.bid_amount ASC, b.created_at ASC`,
      [id]
    );

    const rankings = bidsResult.rows.map((bid, index) => ({
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

    const auditResult = await pool.query(
      "SELECT * FROM rfq_audit WHERE rfq_id = $1 ORDER BY changed_at DESC",
      [id]
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
    res.status(500).json({ success: false, message: "Failed to fetch auction", error: error.message });
  }
};

// ─── Delete an RFQ (admin only) ─────────────────────────────────────────────
const deleteRFQ = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("DELETE FROM rfq WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Auction not found." });
    }
    res.json({ success: true, message: "Auction deleted successfully." });
  } catch (error) {
    console.error("Error deleting RFQ:", error.message);
    res.status(500).json({ success: false, message: "Failed to delete auction.", error: error.message });
  }
};

module.exports = { createRFQ, getRFQs, getRFQById, deleteRFQ };
