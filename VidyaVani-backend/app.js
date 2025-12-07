// app.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const lessonRoutes = require("./routes/lesson");
const diagramRoutes = require("./routes/diagram");
const audioRoutes = require("./routes/audio");

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/lesson", lessonRoutes);
app.use("/api/diagram", diagramRoutes);
app.use("/api/audio", audioRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`VidyaVani backend running on port ${PORT}`);
});
