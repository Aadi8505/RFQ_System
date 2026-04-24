const express = require("express");
const router = express.Router();
const { placeBid } = require("../controllers/bidController");

// Place a bid on an RFQ
router.post("/bid", placeBid);

module.exports = router;
