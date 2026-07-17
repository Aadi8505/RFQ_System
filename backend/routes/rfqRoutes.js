const express = require("express");
const router = express.Router();
const { createRFQ, getRFQs, getRFQById, deleteRFQ } = require("../controllers/rfqController");
const { authenticate, requireUser, requireAdmin } = require("../middleware/authMiddleware");

// Create a new auction (USER ONLY — not admin)
router.post("/rfq", authenticate, requireUser, createRFQ);

// Get all auctions (any authenticated user, including admin)
router.get("/rfqs", authenticate, getRFQs);

// Get single auction details (any authenticated user)
router.get("/rfq/:id", authenticate, getRFQById);

// Delete an auction (ADMIN ONLY)
router.delete("/rfq/:id", authenticate, requireAdmin, deleteRFQ);

module.exports = router;
