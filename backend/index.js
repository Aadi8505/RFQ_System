require("dotenv").config();
const express = require("express");
const cors = require("cors");
const healthRoutes = require("./routes/healthRoutes");
const rfqRoutes = require("./routes/rfqRoutes");
const { testConnection } = require("./config/db");
const bidRoutes = require("./routes/bidRoutes");
const authRoutes = require("./routes/authRoutes");
const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 5000;

app.get("/health", (req, res) => {
  res.send("Server running");
});
// Middleware

// Routes
app.use("/api", authRoutes);
app.use("/api", bidRoutes);
app.use("/api", healthRoutes);
app.use("/api", rfqRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    error: err.message,
  });
});

testConnection();
// Start server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
