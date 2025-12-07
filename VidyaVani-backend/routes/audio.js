// routes/audio.js
const express = require("express");
const router = express.Router();

const {
  polly,
  SynthesizeSpeechCommand,
} = require("../awsClients");

// POST /api/audio
router.post("/", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const params = {
      Text: text,
      OutputFormat: "mp3",
      VoiceId: process.env.POLLY_VOICE_ID || "Aditi",
      LanguageCode: "en-IN",
    };

    const command = new SynthesizeSpeechCommand(params);
    const response = await polly.send(command);

    const audioBase64 = Buffer.from(response.AudioStream).toString("base64");

    res.json({ audioBase64 });
  } catch (err) {
    console.error("Audio route error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
