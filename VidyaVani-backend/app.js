// app.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const lessonRoutes = require("./routes/lesson");
const diagramRoutes = require("./routes/diagram");
const audioRoutes = require("./routes/audio");
const transcribeRoutes = require("./routes/transcribe");
const doubtRoutes = require("./routes/doubt");

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const { rateLimit } = require("express-rate-limit");

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per 15 minutes
  standardHeaders: true, // Return rate limit info in standard headers
  legacyHeaders: false, // Disable X-RateLimit-* legacy headers
  message: {
    error: "Too many requests from this IP. Please try again after 15 minutes."
  }
});

// Routes
app.use("/api/lesson", apiLimiter, lessonRoutes);
app.use("/api/diagram", apiLimiter, diagramRoutes);
app.use("/api/audio", audioRoutes);
app.use("/api/transcribe", transcribeRoutes);
app.use("/api/doubt", apiLimiter, doubtRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`VidyaVani backend running on port ${PORT}`);
});