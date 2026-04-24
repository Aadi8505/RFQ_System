const { pool } = require("../config/db");

const createRFQ = async (req, res) => {
  try {
    const {
      name,
      bid_start_time,
      bid_close_time,
      forced_close_time,
      service_date,
      trigger_window,
      extension_duration,
      trigger_type,
    } = req.body;

    // Check required fields
    const requiredFields = [
      "name",
      "bid_start_time",
      "bid_close_time",
      "forced_close_time",
      "service_date",
    ];

    const missingFields = requiredFields.filter((field) => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: "Missing required fields",
        missing: missingFields,
      });
    }

    // Validate time ordering
    const startTime = new Date(bid_start_time);
    const closeTime = new Date(bid_close_time);
    const forcedTime = new Date(forced_close_time);

    if (startTime >= closeTime) {
      return res.status(400).json({
        error: "bid_start_time must be before bid_close_time",
      });
    }

    if (closeTime >= forcedTime) {
      return res.status(400).json({
        error: "bid_close_time must be before forced_close_time",
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
      bid_start_time,
      bid_close_time,
      forced_close_time,
      service_date,
      trigger_window || 10,
      extension_duration || 5,
      trigger_type || "ANY_BID",
    ];

    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating RFQ:", error.message);
    res.status(500).json({
      error: "Failed to create RFQ",
      details: error.message,
    });
  }
};

module.exports = {
  createRFQ,
};
