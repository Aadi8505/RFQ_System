const express = require("express");
const router = express.Router();
const { getCategories } = require("../controllers/categoryController");
const { authenticate } = require("../middleware/authMiddleware");

// Any authenticated user can view categories
router.get("/categories", authenticate, getCategories);

module.exports = router;
