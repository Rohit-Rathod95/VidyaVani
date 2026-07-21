const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');
const path = require('path');

const clientOptions = {};

if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  let resolvedPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  
  // If the resolved path doesn't exist, check fallback in the backend root directory
  if (!fs.existsSync(resolvedPath)) {
    const filename = path.basename(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    const fallbackPath = path.join(__dirname, filename);
    if (fs.existsSync(fallbackPath)) {
      resolvedPath = fallbackPath;
    }
  }

  // Check if it is a valid file path on the filesystem
  if (fs.existsSync(resolvedPath)) {
    clientOptions.keyFilename = resolvedPath;
    // Overwrite env variable so the underlying Google Auth library uses the absolute path
    process.env.GOOGLE_APPLICATION_CREDENTIALS = resolvedPath;
  } else {
    // If they provided raw JSON credential string content
    try {
      clientOptions.credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    } catch (e) {
      console.warn("⚠️ GOOGLE_APPLICATION_CREDENTIALS is set but is neither a valid file path nor a valid JSON string.");
    }
  }
}

if (process.env.GOOGLE_TTS_API_KEY) {
  clientOptions.apiKey = process.env.GOOGLE_TTS_API_KEY;
}

const ttsClient = new textToSpeech.TextToSpeechClient(clientOptions);

module.exports = ttsClient;
