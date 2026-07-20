// routes/audio.js
const express = require("express");
const router = express.Router();
const NodeCache = require('node-cache');

const ttsClient = require("../googleTtsClient");

// -------------------------------------------------------
// CACHE SETUP (24 hours TTL for audio)
// -------------------------------------------------------
const audioCache = new NodeCache({ 
  stdTTL: 86400, // 24 hours (audio files are larger)
  checkperiod: 3600 // Check every hour
});

// -------------------------------------------------------
// TRACKING STATS
// -------------------------------------------------------
let audioApiCallCount = 0;
let audioCacheHitCount = 0;

// -------------------------------------------------------
// CONSTANTS
// -------------------------------------------------------
const MAX_TEXT_LENGTH = 3000; // Google TTS limit
const MAX_SSML_LENGTH = 6000; // SSML can be longer due to tags

// -------------------------------------------------------
// HELPER: Generate Cache Key for Audio
// -------------------------------------------------------
function getAudioCacheKey(text, voiceId, languageCode) {
  // Create hash of text to avoid very long keys
  const textHash = simpleHash(text);
  return `audio_${voiceId}_${languageCode}_${textHash}`;
}

// Simple hash function
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// -------------------------------------------------------
// POST /api/audio - Generate speech from text
// -------------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const { text, language, voiceId } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    // Trim whitespace
    const cleanText = text.trim();

    // Validate text length
    if (cleanText.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ 
        error: `Text too long. Maximum ${MAX_TEXT_LENGTH} characters allowed.`,
        maxLength: MAX_TEXT_LENGTH,
        currentLength: cleanText.length,
        suggestion: "Try generating audio for shorter sections"
      });
    }

    if (cleanText.length === 0) {
      return res.status(400).json({ error: "Text cannot be empty" });
    }

    // Get voice configuration
    const voiceConfig = getVoiceConfig(language || "English", voiceId);

    // 🔥 CHECK CACHE FIRST
    const cacheKey = getAudioCacheKey(cleanText, voiceConfig.voiceId, voiceConfig.languageCode);
    const cachedAudio = audioCache.get(cacheKey);
    
    if (cachedAudio) {
      audioCacheHitCount++;
      const totalRequests = audioApiCallCount + audioCacheHitCount;
      const savingsPercent = ((audioCacheHitCount / totalRequests) * 100).toFixed(1);
      
      console.log(`✅ Audio Cache HIT for: ${cacheKey.substring(0, 50)}... - FREE!`);
      console.log(`📊 Audio Stats - API Calls: ${audioApiCallCount}, Cache Hits: ${audioCacheHitCount}, Savings: ${savingsPercent}%`);
      
      return res.json({ 
        audioBase64: cachedAudio.audioBase64,
        voiceUsed: voiceConfig.voiceId,
        language: voiceConfig.languageCode,
        duration: cachedAudio.duration,
        cached: true,
        stats: {
          apiCalls: audioApiCallCount,
          cacheHits: audioCacheHitCount,
          savingsPercent: `${savingsPercent}%`
        }
      });
    }
    
    console.log(`❌ Audio Cache MISS - Generating audio`);

    // Build SSML
    const ssmlText = buildSSML(cleanText);

    // Validate SSML length
    if (ssmlText.length > MAX_SSML_LENGTH) {
      return res.status(400).json({ 
        error: "Text with SSML formatting exceeds maximum length",
        suggestion: "Try shorter text"
      });
    }

    const request = {
      input: { ssml: ssmlText },
      voice: { languageCode: voiceConfig.languageCode, name: voiceConfig.voiceId },
      audioConfig: { audioEncoding: 'MP3' },
    };

    console.log("🔊 Generating audio:", {
      voice: voiceConfig.voiceId,
      language: voiceConfig.languageCode,
      textLength: cleanText.length
    });

    const [response] = await ttsClient.synthesizeSpeech(request);
    const audioBase64 = response.audioContent.toString("base64");

    const duration = estimateDuration(cleanText);

    // 🔥 STORE IN CACHE
    audioCache.set(cacheKey, { audioBase64, duration });
    console.log(`💾 Cached audio for: ${cacheKey.substring(0, 50)}...`);

    // Track API usage
    audioApiCallCount++;
    const totalRequests = audioApiCallCount + audioCacheHitCount;
    const savingsPercent = audioCacheHitCount > 0 
      ? ((audioCacheHitCount / totalRequests) * 100).toFixed(1) 
      : 0;
    
    console.log(`📊 Audio Stats - API Calls: ${audioApiCallCount}, Cache Hits: ${audioCacheHitCount}, Savings: ${savingsPercent}%`);

    res.json({ 
      audioBase64,
      voiceUsed: voiceConfig.voiceId,
      language: voiceConfig.languageCode,
      duration,
      cached: false,
      usingFallback: voiceConfig.usingFallback,
      fallbackMessage: voiceConfig.usingFallback 
        ? `Language '${voiceConfig.originalLanguage}' falls back to English.`
        : undefined,
      stats: {
        apiCalls: audioApiCallCount,
        cacheHits: audioCacheHitCount,
        savingsPercent: `${savingsPercent}%`
      }
    });

  } catch (err) {
    console.error("❌ Audio generation error:", err);
    console.error("Error details:", {
      message: err.message,
      code: err.code,
      statusCode: err.$metadata?.httpStatusCode
    });
    
    let errorMessage = "Failed to generate audio";
    let statusCode = 500;

    if (err.code === 'TextLengthExceededException') {
      errorMessage = "Text is too long for audio generation";
      statusCode = 400;
    } else if (err.code === 'InvalidSsmlException') {
      errorMessage = "Invalid text format for speech synthesis";
      statusCode = 400;
    } else if (err.name === 'ThrottlingException') {
      errorMessage = "Too many audio generation requests. Please wait a moment.";
      statusCode = 429;
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// -------------------------------------------------------
// GET /api/audio/voices - Get available voices
// -------------------------------------------------------
router.get("/voices", async (req, res) => {
  try {
    const { language } = req.query;

    const availableVoices = {
      "English": [
        { id: "en-IN-Wavenet-A", name: "Google en-IN-Wavenet-A (Female)", gender: "Female", language: "en-IN" },
        { id: "en-IN-Wavenet-B", name: "Google en-IN-Wavenet-B (Male)", gender: "Male", language: "en-IN" },
      ],
      "Hindi": [
        { id: "hi-IN-Wavenet-A", name: "Google hi-IN-Wavenet-A (Female)", gender: "Female", language: "hi-IN" },
      ],
      "Marathi": [
        { id: "mr-IN-Wavenet-A", name: "Google mr-IN-Wavenet-A (Female)", gender: "Female", language: "mr-IN" },
      ],
      "Tamil": [
        { id: "ta-IN-Wavenet-A", name: "Google ta-IN-Wavenet-A (Female)", gender: "Female", language: "ta-IN" },
      ],
      "Telugu": [
        { id: "te-IN-Wavenet-A", name: "Google te-IN-Wavenet-A (Female)", gender: "Female", language: "te-IN" },
      ],
      "Bengali": [
        { id: "bn-IN-Wavenet-A", name: "Google bn-IN-Wavenet-A (Female)", gender: "Female", language: "bn-IN" },
      ],
      "Gujarati": [
        { id: "gu-IN-Wavenet-A", name: "Google gu-IN-Wavenet-A (Female)", gender: "Female", language: "gu-IN" },
      ],
      "Kannada": [
        { id: "kn-IN-Wavenet-A", name: "Google kn-IN-Wavenet-A (Female)", gender: "Female", language: "kn-IN" },
      ],
      "Malayalam": [
        { id: "ml-IN-Wavenet-A", name: "Google ml-IN-Wavenet-A (Female)", gender: "Female", language: "ml-IN" },
      ],
    };

    if (language && availableVoices[language]) {
      res.json({ 
        voices: availableVoices[language],
        language: language
      });
    } else {
      res.json({ 
        voices: availableVoices,
        supportedLanguages: Object.keys(availableVoices)
      });
    }

  } catch (err) {
    console.error("Error fetching voices:", err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// POST /api/audio/lesson - Generate audio for entire lesson
// -------------------------------------------------------
router.post("/lesson", async (req, res) => {
  try {
    const { lesson, language, voiceId } = req.body;

    console.log("🎓 Lesson audio request:", {
      hasLesson: !!lesson,
      language,
      voiceId
    });

    if (!lesson) {
      return res.status(400).json({ error: "Lesson object is required" });
    }

    // Validate lesson structure
    if (!lesson.title || !lesson.introduction || !lesson.explanation) {
      return res.status(400).json({ 
        error: "Invalid lesson structure",
        required: ["title", "introduction", "explanation", "analogy", "recap"]
      });
    }

    const voiceConfig = getVoiceConfig(language || "English", voiceId);

    // 🔥 CHECK CACHE FIRST (using lesson title + language as key)
    const lessonCacheKey = `lesson_${lesson.title}_${voiceConfig.voiceId}_${voiceConfig.languageCode}`;
    const cachedLessonAudio = audioCache.get(lessonCacheKey);
    
    if (cachedLessonAudio) {
      audioCacheHitCount++;
      const totalRequests = audioApiCallCount + audioCacheHitCount;
      const savingsPercent = ((audioCacheHitCount / totalRequests) * 100).toFixed(1);
      
      console.log(`✅ Lesson Audio Cache HIT for: ${lesson.title} - FREE!`);
      console.log(`📊 Audio Stats - API Calls: ${audioApiCallCount}, Cache Hits: ${audioCacheHitCount}, Savings: ${savingsPercent}%`);
      
      return res.json({ 
        audioBase64: cachedLessonAudio.audioBase64,
        voiceUsed: voiceConfig.voiceId,
        duration: cachedLessonAudio.duration,
        cached: true,
        stats: {
          apiCalls: audioApiCallCount,
          cacheHits: audioCacheHitCount,
          savingsPercent: `${savingsPercent}%`
        }
      });
    }

    console.log(`❌ Lesson Audio Cache MISS - Generating full lesson audio`);

    // Combine lesson sections with natural pauses
    const sections = [
      { label: "Introduction", content: lesson.introduction },
      { label: "Explanation", content: lesson.explanation },
      { label: "Analogy", content: lesson.analogy },
      { label: "Summary", content: lesson.recap }
    ];

    // Build lesson text with breaks
    let fullText = `${lesson.title}. <break time="1s"/>`;
    
    for (const section of sections) {
      if (section.content && section.content.trim()) {
        fullText += `
          <break time="800ms"/>
          ${section.content.trim()}
          <break time="1s"/>
        `;
      }
    }

    // Check length (plain text without SSML tags for estimation)
    const plainTextLength = fullText.replace(/<[^>]*>/g, '').trim().length;
    
    if (plainTextLength > MAX_TEXT_LENGTH) {
      return res.status(400).json({ 
        error: "Lesson text too long for single audio generation",
        currentLength: plainTextLength,
        maxLength: MAX_TEXT_LENGTH,
        suggestion: "Generate audio for each section separately using the section-specific audio buttons"
      });
    }

    const ssmlText = buildSSML(fullText);

    const request = {
      input: { ssml: ssmlText },
      voice: { languageCode: voiceConfig.languageCode, name: voiceConfig.voiceId },
      audioConfig: { audioEncoding: 'MP3' },
    };

    console.log("🔊 Generating lesson audio:", {
      voice: voiceConfig.voiceId,
      language: voiceConfig.languageCode,
      textLength: plainTextLength
    });

    const [response] = await ttsClient.synthesizeSpeech(request);
    const audioBase64 = response.audioContent.toString("base64");

    const duration = estimateDuration(fullText);

    // 🔥 STORE IN CACHE
    audioCache.set(lessonCacheKey, { audioBase64, duration });
    console.log(`💾 Cached lesson audio for: ${lesson.title}`);

    // Track API usage
    audioApiCallCount++;
    const totalRequests = audioApiCallCount + audioCacheHitCount;
    const savingsPercent = audioCacheHitCount > 0 
      ? ((audioCacheHitCount / totalRequests) * 100).toFixed(1) 
      : 0;
    
    console.log(`📊 Audio Stats - API Calls: ${audioApiCallCount}, Cache Hits: ${audioCacheHitCount}, Savings: ${savingsPercent}%`);
    console.log("✅ Lesson audio generated successfully");

    res.json({ 
      audioBase64,
      voiceUsed: voiceConfig.voiceId,
      duration,
      cached: false,
      usingFallback: voiceConfig.usingFallback,
      fallbackMessage: voiceConfig.usingFallback 
        ? `Language '${voiceConfig.originalLanguage}' falls back to English.`
        : undefined,
      stats: {
        apiCalls: audioApiCallCount,
        cacheHits: audioCacheHitCount,
        savingsPercent: `${savingsPercent}%`
      }
    });

  } catch (err) {
    console.error("❌ Lesson audio error:", err);
    console.error("Error details:", {
      message: err.message,
      code: err.code,
      name: err.name,
      statusCode: err.$metadata?.httpStatusCode
    });
    
    let errorMessage = "Failed to generate lesson audio";
    let statusCode = 500;

    if (err.code === 'TextLengthExceededException') {
      errorMessage = "Lesson is too long. Try generating audio for each section separately.";
      statusCode = 400;
    } else if (err.name === 'ThrottlingException') {
      errorMessage = "Too many requests. Please wait a moment.";
      statusCode = 429;
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// -------------------------------------------------------
// ENDPOINT: Audio Stats
// -------------------------------------------------------
router.get("/stats", (req, res) => {
  const totalRequests = audioApiCallCount + audioCacheHitCount;
  const cacheHitRate = totalRequests > 0 
    ? ((audioCacheHitCount / totalRequests) * 100).toFixed(2) 
    : 0;
  
  const cachedKeys = audioCache.keys();

  res.json({
    totalRequests,
    apiCalls: audioApiCallCount,
    cacheHits: audioCacheHitCount,
    cacheHitRate: `${cacheHitRate}%`,
    cachedAudioFiles: cachedKeys.length,
    message: `Saving ${cacheHitRate}% of audio generation quota! 🎧`,
    tip: audioApiCallCount > audioCacheHitCount 
      ? "Generate audio for the same content to improve cache efficiency!"
      : "Great cache performance! 🚀"
  });
});

// -------------------------------------------------------
// ENDPOINT: Clear Audio Cache
// -------------------------------------------------------
router.delete("/cache", (req, res) => {
  const keysCleared = audioCache.keys().length;
  audioCache.flushAll();
  
  res.json({ 
    message: "All audio cache cleared",
    cleared: keysCleared
  });
});

function getVoiceConfig(language, customVoiceId) {
  const languageMap = {
    "English": { languageCode: "en-IN", defaultVoice: "en-IN-Wavenet-A" },
    "Hindi": { languageCode: "hi-IN", defaultVoice: "hi-IN-Wavenet-A" },
    "Marathi": { languageCode: "mr-IN", defaultVoice: "mr-IN-Wavenet-A" },
    "Tamil": { languageCode: "ta-IN", defaultVoice: "ta-IN-Wavenet-A" },
    "Telugu": { languageCode: "te-IN", defaultVoice: "te-IN-Wavenet-A" },
    "Bengali": { languageCode: "bn-IN", defaultVoice: "bn-IN-Wavenet-A" },
    "Gujarati": { languageCode: "gu-IN", defaultVoice: "gu-IN-Wavenet-A" },
    "Kannada": { languageCode: "kn-IN", defaultVoice: "kn-IN-Wavenet-A" },
    "Malayalam": { languageCode: "ml-IN", defaultVoice: "ml-IN-Wavenet-A" }
  };

  const config = languageMap[language] || languageMap["English"];
  
  let voiceId = config.defaultVoice;
  if (customVoiceId && customVoiceId !== "Aditi" && customVoiceId !== "Raveena") {
    voiceId = customVoiceId;
  }

  return {
    voiceId,
    languageCode: config.languageCode,
    originalLanguage: language,
    usingFallback: !languageMap[language]
  };
}

// -------------------------------------------------------
// HELPER: Build SSML with proper escaping
// -------------------------------------------------------
function buildSSML(text) {
  // First, extract existing SSML tags
  const ssmlTags = /<break[^>]*>/g;
  const tags = text.match(ssmlTags) || [];
  
  // Replace tags with placeholders
  let cleanText = text;
  tags.forEach((tag, i) => {
    cleanText = cleanText.replace(tag, `__SSML_TAG_${i}__`);
  });

  // Escape XML special characters
  cleanText = cleanText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  // Restore SSML tags
  tags.forEach((tag, i) => {
    cleanText = cleanText.replace(`__SSML_TAG_${i}__`, tag);
  });

  // Add prosody for better natural speech
  return `
    <speak>
      <prosody rate="medium" pitch="medium">
        ${cleanText}
      </prosody>
    </speak>
  `.trim();
}

// -------------------------------------------------------
// HELPER: Estimate duration (in seconds)
// -------------------------------------------------------
function estimateDuration(text) {
  // Handle case where text might be a number or not a string
  if (typeof text !== 'string') {
    console.warn('estimateDuration received non-string:', typeof text);
    return 0;
  }

  // Remove SSML tags for word count
  const plainText = text.replace(/<[^>]*>/g, '');
  const words = plainText.split(/\s+/).filter(w => w.length > 0).length;
  
  // Average speaking rate: 150 words per minute
  const minutes = words / 150;
  const seconds = Math.ceil(minutes * 60);
  
  // Add extra time for breaks
  const breakMatches = text.match(/<break[^>]*>/g) || [];
  const breakTime = breakMatches.reduce((total, breakTag) => {
    const timeMatch = breakTag.match(/time="(\d+)(ms|s)"/);
    if (timeMatch) {
      const value = parseInt(timeMatch[1]);
      const unit = timeMatch[2];
      return total + (unit === 's' ? value : value / 1000);
    }
    return total;
  }, 0);
  
  return seconds + Math.ceil(breakTime);
}

module.exports = router;