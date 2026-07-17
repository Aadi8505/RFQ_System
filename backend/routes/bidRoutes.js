const express = require("express");
const router = express.Router();
const { placeBid } = require("../controllers/bidController");
const { authenticate, requireUser } = require("../middleware/authMiddleware");

// Place a bid (USER ONLY — not admin, not on own auction)
router.post("/bid", authenticate, requireUser, placeBid);

module.exports = router;
