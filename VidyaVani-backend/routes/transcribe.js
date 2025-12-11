// routes/transcribe.js
require('dotenv').config();
const express = require("express");
const router = express.Router();
const { createClient } = require('@deepgram/sdk');

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// Language code mapping (kept from your original file)
const languageCodeMap = {
  "English": "en-US",
  "Hindi": "hi-IN",
  "Marathi": "hi-IN", // Fallback to Hindi
  "Tamil": "ta-IN",
  "Telugu": "te-IN",
  "Bengali": "bn-IN",
  "Gujarati": "gu-IN",
  "Kannada": "kn-IN",
  "Malayalam": "ml-IN"
};

// POST endpoint for transcription using Deepgram prerecorded API
router.post("/", async (req, res) => {
  try {
    const { audioData, language = "English" } = req.body;

    if (!audioData) {
      return res.status(400).json({ error: "No audio data provided" });
    }

    // Resolve Deepgram language code (fallback to en-US)
    const languageCode = languageCodeMap[language] || "en-US";

    // Convert base64 audio to buffer
    const audioBuffer = Buffer.from(audioData, "base64");

    // Call Deepgram prerecorded transcription
    // (Using the SDK helper for prerecorded audio)
    const options = {
      model: "nova-3",         // recommended general-purpose model
      language: languageCode,  // example: "en-US", "hi-IN"
      // You may add other params here like: punctuate, profanity_filter, tier, etc.
    };

    // transcribeFile accepts a buffer (or stream) and options
    const dgResponse = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      options
    );

    // Extract transcript safely
    // Response shape: dgResponse.result.results.channels[0].alternatives[0].transcript
    let transcription = "";
    try {
      const channels = dgResponse?.result?.results?.channels;
      if (channels && channels.length > 0) {
        const alt = channels[0].alternatives && channels[0].alternatives[0];
        if (alt && alt.transcript) {
          transcription = alt.transcript;
        }
      }
    } catch (extractErr) {
      console.warn("Could not extract transcript from Deepgram response", extractErr);
    }

    return res.json({
      success: true,
      transcription: transcription.trim(),
      raw: dgResponse, // optional: remove if you don't want to send full response to client
    });
  } catch (error) {
    console.error("Transcription error (Deepgram):", error);
    // Provide as much useful information as safe (avoid leaking sensitive internals)
    return res.status(500).json({
      error: "Transcription failed",
      details: error.message || String(error),
    });
  }
});

module.exports = router;
