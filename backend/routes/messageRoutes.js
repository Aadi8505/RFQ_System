const express = require("express");
const router = express.Router();
const { getMessages, sendMessage, getUnreadCount, closeChat } = require("../controllers/messageController");
const { authenticate } = require("../middleware/authMiddleware");

// Get unread count (must be BEFORE /:rfqId to avoid route collision)
router.get("/messages/unread/count", authenticate, getUnreadCount);

// Get messages for an auction (poster ↔ winner only, after close)
router.get("/messages/:rfqId", authenticate, getMessages);

// Send a message in an auction chat
router.post("/messages/:rfqId", authenticate, sendMessage);

// Manually close chat (poster only)
router.post("/messages/:rfqId/close", authenticate, closeChat);

module.exports = router;
