const express = require("express");
const router = express.Router();
const { createRFQ } = require("../controllers/rfqController");

// Create a new RFQ
router.post("/rfq", createRFQ);

module.exports = router;
