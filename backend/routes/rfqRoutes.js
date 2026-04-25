const express = require("express");
const router = express.Router();
const { createRFQ, getRFQs, getRFQById } = require("../controllers/rfqController");

// Create a new RFQ
router.post("/rfq", createRFQ);

// Get all RFQs (Auction Listing Page)
router.get("/rfqs", getRFQs);

// Get single RFQ details with bids, rankings, and audit log (Auction Details Page)
router.get("/rfq/:id", getRFQById);

module.exports = router;
