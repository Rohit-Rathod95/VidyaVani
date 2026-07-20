const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');

const clientOptions = {};

if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  // Check if it is a valid file path on the filesystem
  if (fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    clientOptions.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
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
