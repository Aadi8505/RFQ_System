require('dotenv').config()
const express = require("express");
const cors = require('cors')
const healthRoutes = require("./routes/healthRoutes");

const app = express();
app.use(cors())
app.use(express.json());
const PORT = process.env.PORT || 5000;

app.get('/health', (req, res) => {
  res.send("Server running")
})
// Middleware


// Routes
app.use("/api", healthRoutes);

// Error handling middleware (optional)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
