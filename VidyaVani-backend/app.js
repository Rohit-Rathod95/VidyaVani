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

// Routes
app.use("/api/lesson", lessonRoutes);
app.use("/api/diagram", diagramRoutes);
app.use("/api/audio", audioRoutes);
app.use("/api/transcribe", transcribeRoutes);
app.use("/api/doubt", doubtRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`VidyaVani backend running on port ${PORT}`);
});