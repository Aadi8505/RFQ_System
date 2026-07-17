require("dotenv").config();
const express = require("express");
const cors = require("cors");
const healthRoutes = require("./routes/healthRoutes");
const rfqRoutes = require("./routes/rfqRoutes");
const { testConnection } = require("./config/db");
const bidRoutes = require("./routes/bidRoutes");
const authRoutes = require("./routes/authRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const adminRoutes = require("./routes/adminRoutes");
const messageRoutes = require("./routes/messageRoutes");

const app = express();

// Read allowed origins from env (comma-separated)
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      // Allow if origin is in the whitelist
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json());
const PORT = process.env.PORT || 5000;

app.get("/health", (req, res) => {
  res.send("Server running");
});

// Routes
app.use("/api", authRoutes);
app.use("/api", bidRoutes);
app.use("/api", healthRoutes);
app.use("/api", rfqRoutes);
app.use("/api", categoryRoutes);
app.use("/api", adminRoutes);
app.use("/api", messageRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    error: err.message,
  });
});

const http = require("http");
const socketManager = require("./config/socket");

const server = http.createServer(app);
socketManager.init(server, allowedOrigins);

testConnection();

// Keep Neon database warm — ping every 4 minutes to prevent cold starts
const { pool } = require("./config/db");
setInterval(async () => {
  try {
    await pool.query("SELECT 1");
  } catch (e) {
    // Silent — don't crash server on keep-alive failure
  }
}, 4 * 60 * 1000);

// Start server
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
