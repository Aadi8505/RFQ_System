const { pool } = require("../config/db");

// ─── GET /api/admin/stats ────────────────────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const nowResult = await pool.query("SELECT NOW() as now");
    const dbNow = new Date(nowResult.rows[0].now);

    // Parallel queries for stats
    const [usersResult, auctionsResult, bidsResult, activeResult, categoriesResult] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM users WHERE is_active = TRUE"),
      pool.query("SELECT COUNT(*) as count FROM rfq"),
      pool.query("SELECT COUNT(*) as count FROM bids"),
      pool.query(
        "SELECT COUNT(*) as count FROM rfq WHERE bid_start_time <= $1 AND bid_close_time > $1",
        [dbNow]
      ),
      pool.query(
        `SELECT c.id, c.name, c.icon, COUNT(r.id) as auction_count 
         FROM categories c 
         LEFT JOIN rfq r ON c.id = r.category_id 
         WHERE c.is_active = TRUE 
         GROUP BY c.id 
         ORDER BY auction_count DESC`
      ),
    ]);

    // Recent activity (last 10 audit logs)
    const recentActivity = await pool.query(
      `SELECT a.*, r.name as rfq_name 
       FROM rfq_audit a 
       LEFT JOIN rfq r ON a.rfq_id = r.id 
       ORDER BY a.changed_at DESC 
       LIMIT 10`
    );

    // Top bidders
    const topBidders = await pool.query(
      `SELECT u.name, u.email, COUNT(b.id) as bid_count 
       FROM bids b 
       JOIN users u ON b.user_id = u.id 
       GROUP BY u.id, u.name, u.email 
       ORDER BY bid_count DESC 
       LIMIT 5`
    );

    // Top posters
    const topPosters = await pool.query(
      `SELECT u.name, u.email, COUNT(r.id) as post_count 
       FROM rfq r 
       JOIN users u ON r.created_by = u.id 
       GROUP BY u.id, u.name, u.email 
       ORDER BY post_count DESC 
       LIMIT 5`
    );

    res.json({
      success: true,
      data: {
        total_users: parseInt(usersResult.rows[0].count),
        total_auctions: parseInt(auctionsResult.rows[0].count),
        total_bids: parseInt(bidsResult.rows[0].count),
        active_auctions: parseInt(activeResult.rows[0].count),
        categories_breakdown: categoriesResult.rows,
        recent_activity: recentActivity.rows,
        top_bidders: topBidders.rows,
        top_posters: topPosters.rows,
      },
    });
  } catch (err) {
    console.error("Error fetching admin stats:", err.message);
    res.status(500).json({ success: false, message: "Failed to fetch stats." });
  }
};

module.exports = { getStats };
