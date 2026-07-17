const { pool } = require("../config/db");

/**
 * Helper: Check if chat is allowed for this auction + user
 * Returns { allowed, reason, rfq, winnerId, posterId } or error
 */
const validateChatAccess = async (rfqId, userId, isWrite = false) => {
  // Single query: fetch RFQ + winner + current DB time all at once
  const result = await pool.query(
    `SELECT 
       r.*,
       NOW() as db_now,
       (SELECT user_id FROM bids 
        WHERE rfq_id = r.id 
        ORDER BY bid_amount ASC, created_at ASC 
        LIMIT 1) as winner_id
     FROM rfq r
     WHERE r.id = $1`,
    [rfqId]
  );

  if (result.rows.length === 0) {
    return { allowed: false, reason: "Auction not found." };
  }

  const rfq = result.rows[0];
  const winnerId = rfq.winner_id;
  const posterId = rfq.created_by;
  const now = new Date(rfq.db_now);
  const bidCloseTime = new Date(rfq.bid_close_time);
  const forcedCloseTime = new Date(rfq.forced_close_time);

  // Check winner exists
  if (!winnerId) {
    return { allowed: false, reason: "No bids were placed on this auction. Chat is unavailable." };
  }

  // Check the user is either the poster or the winner
  if (userId !== posterId && userId !== winnerId) {
    return { allowed: false, reason: "Chat is only available between the auction poster and the winning bidder." };
  }

  // Check if manually closed by poster
  if (rfq.chat_closed_by_poster) {
    if (isWrite) {
      return { allowed: false, reason: "Chat has been closed by the service poster." };
    }
    return { allowed: true, rfq, winnerId, posterId, chatClosed: true, reason: "Chat has been closed by the service poster." };
  }

  // Check auction is closed
  const isClosed = now >= bidCloseTime || now >= forcedCloseTime;
  if (!isClosed) {
    return { allowed: false, reason: "Chat is only available after the auction closes." };
  }

  // Check 30-minute expiry
  const actualCloseTime = now >= forcedCloseTime ? forcedCloseTime : bidCloseTime;
  const timeSinceCloseMs = now.getTime() - actualCloseTime.getTime();
  if (timeSinceCloseMs > 30 * 60 * 1000) {
    if (isWrite) {
      return { allowed: false, reason: "Chat has expired (chat sessions are limited to 30 minutes post-auction)." };
    }
    return { allowed: true, rfq, winnerId, posterId, chatClosed: true, reason: "Chat has expired (chat sessions are limited to 30 minutes post-auction)." };
  }

  return { allowed: true, rfq, winnerId, posterId, chatClosed: false };
};

// ─── GET /api/messages/:rfqId ────────────────────────────────────────────────
const getMessages = async (req, res) => {
  try {
    const { rfqId } = req.params;
    const userId = req.user.id;

    const access = await validateChatAccess(parseInt(rfqId), userId, false);
    if (!access.allowed) {
      return res.status(403).json({ success: false, message: access.reason });
    }

    const { winnerId, posterId } = access;

    // Fetch messages between poster and winner for this auction
    const messagesResult = await pool.query(
      `SELECT m.*, 
              s.name as sender_name, s.avatar_url as sender_avatar,
              r.name as receiver_name
       FROM messages m
       LEFT JOIN users s ON m.sender_id = s.id
       LEFT JOIN users r ON m.receiver_id = r.id
       WHERE m.rfq_id = $1 
         AND ((m.sender_id = $2 AND m.receiver_id = $3) OR (m.sender_id = $3 AND m.receiver_id = $2))
       ORDER BY m.created_at ASC`,
      [rfqId, posterId, winnerId]
    );

    // Mark unread messages as read for current user
    await pool.query(
      `UPDATE messages SET is_read = TRUE 
       WHERE rfq_id = $1 AND receiver_id = $2 AND is_read = FALSE`,
      [rfqId, userId]
    );

    // Get chat partner info
    const partnerId = userId === posterId ? winnerId : posterId;
    const partnerResult = await pool.query(
      "SELECT id, name, email, avatar_url FROM users WHERE id = $1",
      [partnerId]
    );

    res.json({
      success: true,
      data: {
        messages: messagesResult.rows,
        partner: partnerResult.rows[0] || null,
        my_role: userId === posterId ? "poster" : "winner",
        chat_closed: !!access.chatClosed,
        closed_reason: access.reason || null
      },
    });
  } catch (err) {
    console.error("Error fetching messages:", err.message);
    res.status(500).json({ success: false, message: "Failed to fetch messages." });
  }
};

// ─── POST /api/messages/:rfqId ───────────────────────────────────────────────
const sendMessage = async (req, res) => {
  try {
    const { rfqId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ success: false, message: "Message content is required." });
    }

    if (content.length > 2000) {
      return res.status(400).json({ success: false, message: "Message is too long (max 2000 characters)." });
    }

    const access = await validateChatAccess(parseInt(rfqId), userId, true);
    if (!access.allowed) {
      return res.status(403).json({ success: false, message: access.reason });
    }

    const { winnerId, posterId } = access;

    // Determine receiver
    const receiverId = userId === posterId ? winnerId : posterId;

    const result = await pool.query(
      `INSERT INTO messages (rfq_id, sender_id, receiver_id, content)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [rfqId, userId, receiverId, content.trim()]
    );

    const message = result.rows[0];

    // Fetch sender info for response
    const senderResult = await pool.query(
      "SELECT name, avatar_url FROM users WHERE id = $1",
      [userId]
    );

    const responseData = {
      ...message,
      sender_name: senderResult.rows[0]?.name,
      sender_avatar: senderResult.rows[0]?.avatar_url,
    };

    // Emit socket event for real-time chat messages
    try {
      const { getIO } = require("../config/socket");
      const io = getIO();
      io.to(`rfq-${rfqId}-chat`).emit("message-received", responseData);
    } catch (err) {
      console.error("Socket emit error on sendMessage:", err.message);
    }

    res.status(201).json({
      success: true,
      data: responseData,
    });
  } catch (err) {
    console.error("Error sending message:", err.message);
    res.status(500).json({ success: false, message: "Failed to send message." });
  }
};

// ─── GET /api/messages/unread/count ──────────────────────────────────────────
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      "SELECT COUNT(*) as count FROM messages WHERE receiver_id = $1 AND is_read = FALSE",
      [userId]
    );
    res.json({ success: true, count: parseInt(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch unread count." });
  }
};

// ─── POST /api/messages/:rfqId/close ─────────────────────────────────────────
const closeChat = async (req, res) => {
  try {
    const { rfqId } = req.params;
    const userId = req.user.id;

    const rfqResult = await pool.query("SELECT * FROM rfq WHERE id = $1", [rfqId]);
    if (rfqResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Auction not found." });
    }
    const rfq = rfqResult.rows[0];

    if (rfq.created_by !== userId) {
      return res.status(403).json({ success: false, message: "Only the service poster can manually close this chat." });
    }

    await pool.query("UPDATE rfq SET chat_closed_by_poster = TRUE WHERE id = $1", [rfqId]);

    try {
      const { getIO } = require("../config/socket");
      const io = getIO();
      io.to(`rfq-${rfqId}-chat`).emit("chat-closed");
    } catch (err) {
      console.error("Socket emit error on closeChat:", err.message);
    }

    res.json({ success: true, message: "Chat closed successfully." });
  } catch (err) {
    console.error("Error closing chat:", err.message);
    res.status(500).json({ success: false, message: "Failed to close chat." });
  }
};

module.exports = { getMessages, sendMessage, getUnreadCount, closeChat };
