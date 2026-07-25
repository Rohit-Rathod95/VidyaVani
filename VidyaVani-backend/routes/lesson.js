// ============================================
// routes/lessons.js - OPTIMIZED VERSION
// ============================================
const express = require("express");
const router = express.Router();
const { getCache, setCache, clearCacheByPattern, countCacheByPattern } = require("../utils/redisClient");

const ttsClient = require("../googleTtsClient");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

let apiCallCount = 0;
let cacheHitCount = 0;
let audioApiCalls = 0;
let audioCacheHits = 0;

// -------------------------------------------------------
// VALIDATION CONSTANTS
// -------------------------------------------------------
const VALID_LANGUAGES = ['English', 'Hindi', 'Marathi', 'Tamil', 'Telugu', 'Kannada', 'Bengali', 'Gujarati', 'Malayalam'];
const MIN_GRADE = 1;
const MAX_GRADE = 12;
const MAX_AUDIO_LENGTH = 3000;

// -------------------------------------------------------
// HELPER: Sanitize Prompt Input (Anti-Prompt Injection)
// -------------------------------------------------------
function sanitizePromptInput(text) {
  if (typeof text !== 'string') return '';
  
  // Normalize and clean excessive newlines
  let clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  
  // Strip system prompt injection attempts
  const injectionPatterns = [
    /ignore\s+(?:all\s+)?previous\s+instructions/gi,
    /ignore\s+(?:all\s+)?instructions\s+above/gi,
    /forget\s+(?:all\s+)?previous\s+instructions/gi,
    /forget\s+my\s+instructions/gi,
    /system\s+prompt/gi,
    /you\s+are\s+now\s+a/gi,
    /instead\s+of\s+what\s+you\s+were/gi,
    /override\s+instructions/gi,
    /bypass\s+restrictions/gi
  ];
  
  injectionPatterns.forEach(pattern => {
    clean = clean.replace(pattern, '[REMOVED]');
  });
  
  // Strip HTML/XML structural delimiters that target common prompt syntax
  clean = clean.replace(/<\/?(?:system|instruction|user|assistant|prompt|speak|prosody|break)[^>]*>/gi, '');

  return clean.trim();
}

// -------------------------------------------------------
// HELPER: Generate Cache Keys
// -------------------------------------------------------
function getLessonCacheKey(topic, grade, language) {
  return `lesson_${topic.toLowerCase().trim()}_${grade}_${language.toLowerCase()}`;
}

function getAudioCacheKey(topic, grade, language) {
  return `audio_${topic.toLowerCase().trim()}_${grade}_${language.toLowerCase()}`;
}

// -------------------------------------------------------
// HELPER: Validate Input
// -------------------------------------------------------
function validateInput(topic, grade, language) {
  const errors = [];
  if (!topic || topic.trim().length === 0) errors.push("Topic cannot be empty");
  if (topic.length > 200) errors.push("Topic too long (max 200 characters)");
  if (grade < MIN_GRADE || grade > MAX_GRADE) errors.push(`Grade must be between ${MIN_GRADE} and ${MAX_GRADE}`);
  if (!VALID_LANGUAGES.includes(language)) errors.push(`Language must be one of: ${VALID_LANGUAGES.join(', ')}`);
  return errors;
}

// -------------------------------------------------------
// HELPER: Voice Configuration
// -------------------------------------------------------
function getVoiceConfig(language) {
  const languageMap = {
    "English": { languageCode: "en-IN", voiceId: "en-IN-Wavenet-A" },
    "Hindi": { languageCode: "hi-IN", voiceId: "hi-IN-Wavenet-A" },
    "Marathi": { languageCode: "mr-IN", voiceId: "mr-IN-Wavenet-A" },
    "Tamil": { languageCode: "ta-IN", voiceId: "ta-IN-Wavenet-A" },
    "Telugu": { languageCode: "te-IN", voiceId: "te-IN-Wavenet-A" },
    "Bengali": { languageCode: "bn-IN", voiceId: "bn-IN-Wavenet-A" },
    "Gujarati": { languageCode: "gu-IN", voiceId: "gu-IN-Wavenet-A" },
    "Kannada": { languageCode: "kn-IN", voiceId: "kn-IN-Wavenet-A" },
    "Malayalam": { languageCode: "ml-IN", voiceId: "ml-IN-Wavenet-A" }
  };
  
  const config = languageMap[language];
  if (config) {
    return {
      voiceId: config.voiceId,
      languageCode: config.languageCode,
      isFallback: false
    };
  }

  return {
    voiceId: "en-IN-Wavenet-A",
    languageCode: "en-IN",
    isFallback: true
  };
}

// -------------------------------------------------------
// HELPER: Build SSML
// -------------------------------------------------------
function buildSSML(text) {
  const ssmlTags = /<break[^>]*>/g;
  const tags = text.match(ssmlTags) || [];
  
  let cleanText = text;
  tags.forEach((tag, i) => {
    cleanText = cleanText.replace(tag, `__SSML_TAG_${i}__`);
  });

  cleanText = cleanText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  tags.forEach((tag, i) => {
    cleanText = cleanText.replace(`__SSML_TAG_${i}__`, tag);
  });

  return `<speak><prosody rate="medium" pitch="medium">${cleanText}</prosody></speak>`.trim();
}

// -------------------------------------------------------
// HELPER: Generate Audio (with caching)
// -------------------------------------------------------
async function generateAudioForText(text, language, cacheKey = null) {
  // Check audio cache first if cacheKey provided
  if (cacheKey) {
    const cached = await getCache(cacheKey);
    if (cached) {
      audioCacheHits++;
      console.log(`✅ Audio Cache HIT: ${cacheKey}`);
      return { ...cached, cached: true };
    }
  }

  const voiceConfig = getVoiceConfig(language);
  
  // Truncate if needed
  let audioText = text;
  if (text.length > MAX_AUDIO_LENGTH) {
    audioText = text.substring(0, MAX_AUDIO_LENGTH) + "...";
    console.log(`⚠️ Audio text truncated from ${text.length} to ${MAX_AUDIO_LENGTH} chars`);
  }

  const ssmlText = buildSSML(audioText);

  console.log("🔊 Generating audio:", {
    voice: voiceConfig.voiceId,
    language: voiceConfig.languageCode,
    textLength: audioText.length,
    cacheKey: cacheKey || 'none'
  });

  const request = {
    input: { ssml: ssmlText },
    voice: { languageCode: voiceConfig.languageCode, name: voiceConfig.voiceId },
    audioConfig: { audioEncoding: 'MP3' },
  };

  const [response] = await ttsClient.synthesizeSpeech(request);
  const audioBase64 = response.audioContent.toString("base64");

  const result = {
    audioBase64,
    voiceUsed: voiceConfig.voiceId,
    languageCode: voiceConfig.languageCode,
    isFallback: voiceConfig.isFallback,
    cached: false
  };

  // Cache the audio if cacheKey provided (7 days TTL)
  if (cacheKey) {
    await setCache(cacheKey, result, 604800);
    console.log(`💾 Cached audio: ${cacheKey}`);
  }

  audioApiCalls++;
  return result;
}

// -------------------------------------------------------
// HELPER: RAG Retrieval & Source Extraction
// -------------------------------------------------------
const RAG_ENDPOINT = "https://s4g4c6g1v9.execute-api.us-east-1.amazonaws.com/retrieve";
const RAG_TIMEOUT_MS = 8000;
const RAG_SIMILARITY_THRESHOLD = 0.6;

async function fetchRagChunks(topic, grade, subject) {
  try {
    const payload = {
      query: topic,
      top_k: 5,
      grade: grade
    };
    if (subject) {
      payload.subject = subject;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RAG_TIMEOUT_MS);

    const response = await fetch(RAG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`⚠️ RAG API returned non-OK status: ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.chunks)) {
      console.warn("⚠️ RAG API response missing chunks array");
      return [];
    }

    return data.chunks;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn(`⚠️ RAG API call timed out after ${RAG_TIMEOUT_MS}ms`);
    } else {
      console.warn("⚠️ RAG API call failed:", err.message);
    }
    return [];
  }
}

function filterRelevantChunks(chunks) {
  if (!Array.isArray(chunks)) return [];
  return chunks.filter(c => typeof c.similarity === 'number' && c.similarity >= RAG_SIMILARITY_THRESHOLD);
}

function extractSources(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) return [];
  const seen = new Set();
  const sources = [];
  for (const chunk of chunks) {
    const chapter = chunk.chapter || "";
    const page = chunk.page;
    const key = `${chapter}___${page}`;
    if (!seen.has(key)) {
      seen.add(key);
      sources.push({ chapter, page });
    }
  }
  return sources;
}

// -------------------------------------------------------
// MAIN ROUTE - GENERATE LESSON WITH AUTO-AUDIO
// -------------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const { topic, grade, language, subject } = req.body || {};

    if (!topic) {
      return res.status(400).json({ error: "Topic is required" });
    }

    const sanitizedTopic = sanitizePromptInput(topic);
    if (sanitizedTopic.length === 0) {
      return res.status(400).json({ error: "Topic cannot be empty or contain invalid characters" });
    }

    const gradeLevel = parseInt(grade) || 6;
    const lang = language || "English";

    const validationErrors = validateInput(sanitizedTopic, gradeLevel, lang);
    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }

    // Check lesson cache
    const lessonCacheKey = getLessonCacheKey(sanitizedTopic, gradeLevel, lang);
    const cachedLesson = await getCache(lessonCacheKey);
    
    if (cachedLesson) {
      cacheHitCount++;
      console.log(`✅ Lesson Cache HIT: ${lessonCacheKey}`);
      
      // Check if audio is also cached
      const audioCacheKey = getAudioCacheKey(sanitizedTopic, gradeLevel, lang);
      let audioData = null;
      
      try {
        audioData = await generateAudioForText(
          `${cachedLesson.title}. ${cachedLesson.introduction} ${cachedLesson.explanation}`,
          lang,
          audioCacheKey
        );
      } catch (audioErr) {
        console.warn("⚠️ Auto-audio generation failed for cached lesson:", audioErr.message);
      }
      
      return res.json({ 
        lesson: cachedLesson,
        audio: audioData,
        cached: true,
        stats: {
          lessonApiCalls: apiCallCount,
          lessonCacheHits: cacheHitCount,
          audioApiCalls: audioApiCalls,
          audioCacheHits: audioCacheHits
        }
      });
    }
    
    console.log(`❌ Lesson Cache MISS: ${lessonCacheKey}`);

    // Call RAG API with timeout and error fallback
    console.log(`🔍 Fetching RAG chunks for topic: "${sanitizedTopic}", grade: ${gradeLevel}`);
    const rawChunks = await fetchRagChunks(sanitizedTopic, gradeLevel, subject);
    const relevantChunks = filterRelevantChunks(rawChunks);
    const sources = extractSources(relevantChunks);
    console.log(`📚 RAG retrieved ${rawChunks.length} chunks (${relevantChunks.length} above similarity threshold)`);

    // Generate lesson content
    let lessonContent = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts && !lessonContent) {
      try {
        lessonContent = await generateLesson(sanitizedTopic, gradeLevel, lang, relevantChunks);
        if (!lessonContent || lessonContent.length < 100) {
          lessonContent = null;
          attempts++;
        } else {
          break;
        }
      } catch (error) {
        console.error(`❌ Attempt ${attempts + 1} failed:`, error.message);
        attempts++;
        if (attempts >= maxAttempts) throw error;
      }
    }

    if (!lessonContent) {
      lessonContent = generateFallbackContent(sanitizedTopic, gradeLevel, lang);
    }

    const parsedLesson = parseLesson(lessonContent, sanitizedTopic, gradeLevel);
    
    // Generate quiz
    const quiz = await generateQuiz(sanitizedTopic, gradeLevel, lang);

    const lesson = {
      title: `${sanitizedTopic} - Grade ${gradeLevel}`,
      ...parsedLesson,
      quiz: quiz,
      sources: sources,
      language: lang,
      grade: gradeLevel,
      timestamp: new Date().toISOString()
    };

    // Cache lesson (7 days TTL)
    await setCache(lessonCacheKey, lesson, 604800);
    console.log(`💾 Cached lesson: ${lessonCacheKey}`);
    apiCallCount++;

    // Generate auto-audio
    let audioData = null;
    const audioCacheKey = getAudioCacheKey(sanitizedTopic, gradeLevel, lang);
    
    try {
      const audioText = `${lesson.title}. ${lesson.introduction} ${lesson.explanation}`;
      audioData = await generateAudioForText(audioText, lang, audioCacheKey);
      console.log("✅ Auto-audio generated successfully");
    } catch (audioErr) {
      console.warn("⚠️ Auto-audio generation failed:", audioErr.message);
      // Don't fail the request, just log the error
    }

    res.json({ 
      lesson,
      audio: audioData, // null if failed
      cached: false,
      stats: {
        lessonApiCalls: apiCallCount,
        lessonCacheHits: cacheHitCount,
        audioApiCalls: audioApiCalls,
        audioCacheHits: audioCacheHits
      }
    });

  } catch (err) {
    console.error("❌ Lesson generation error:", err);
    
    let errorMessage = "Failed to generate lesson";
    let statusCode = 500;

    if (err.name === 'ThrottlingException') {
      errorMessage = "Too many requests. Please try again in a few seconds.";
      statusCode = 429;
    }

    res.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// -------------------------------------------------------
// GENERATE LESSON HELPER
// -------------------------------------------------------
async function generateLesson(topic, grade, language, chunks = []) {
  const languageNote = language !== 'English' 
    ? `CRITICAL: You MUST write your ENTIRE response in ${language} language.`
    : '';

  let groundingText = "";
  if (Array.isArray(chunks) && chunks.length > 0) {
    const excerpts = chunks.map((chunk, index) => 
      `[Excerpt ${index + 1} - Page ${chunk.page || 'N/A'}]: ${chunk.text}`
    ).join("\n\n");

    groundingText = `Use the following textbook excerpts as your primary source of truth when generating this lesson. If the excerpts don't fully cover the topic, you may supplement with your own knowledge, but prioritize accuracy to these excerpts:\n\n${excerpts}\n\n`;
  }

  const prompt = `${groundingText}You are an expert teacher for grade ${grade} students.
${languageNote}

Create a complete lesson about: ${topic}

Write exactly 4 paragraphs in ${language} language:

Paragraph 1 - Introduction:
Start with "Let's learn about ${topic}." Explain what it is in 2-3 simple sentences.

Paragraph 2 - Detailed Explanation:
Explain how ${topic} works. Use simple words suitable for grade ${grade}.

Paragraph 3 - Real-Life Example:
Give ONE clear example from daily life. Start with "For example,"

Paragraph 4 - Summary:
Summarize the 3 most important points. Start with "To summarize,"

Keep language simple for grade ${grade} students.`;

  try {
    return await callGemini(prompt);
  } catch (error) {
    console.error("❌ Lesson generation failed:", error.message);
    throw error;
  }
}

// -------------------------------------------------------
// GENERATE QUIZ HELPER
// -------------------------------------------------------
async function generateQuiz(topic, grade, language) {
  const languageNote = language !== 'English' 
    ? `CRITICAL: Write everything in ${language} language only.`
    : '';

  const quizPrompt = `${languageNote}
Create 3 quiz questions about ${topic} for grade ${grade} students in ${language}.

Question 1 (Easy - True/False):
Simple true/false question.

Question 2 (Medium - Multiple Choice):
4 options (A, B, C, D). Mark correct answer.

Question 3 (Hard - Short Answer):
Application question.

Format clearly in ${language}.`;

  try {
    return await callGemini(quizPrompt);
  } catch (error) {
    console.error("⚠️ Quiz generation failed:", error.message);
    return generateFallbackQuiz(topic, grade, language);
  }
}

// -------------------------------------------------------
// GEMINI API HELPER
// -------------------------------------------------------
async function callGemini(prompt) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
    const result = await model.generateContent(prompt);
    return result.response.text().trim() || "";
  } catch (err) {
    console.error("❌ Gemini generation error:", err.message);
    throw err;
  }
}

// -------------------------------------------------------
// PARSE LESSON HELPER
// -------------------------------------------------------
function parseLesson(rawText, topic, gradeLevel) {
  let paragraphs = rawText
    .split(/\n\s*\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 30);

  paragraphs = paragraphs.map(p => 
    p.replace(/^(PARAGRAPH \d+|Introduction|Explanation|Example|Summary):?\s*/i, '')
     .trim()
  ).filter(p => p.length > 20);

  while (paragraphs.length < 4) {
    paragraphs.push(`Content about ${topic} for grade ${gradeLevel}.`);
  }

  return {
    introduction: paragraphs[0],
    explanation: paragraphs[1],
    analogy: paragraphs[2],
    recap: paragraphs[3]
  };
}

// -------------------------------------------------------
// FALLBACK HELPERS
// -------------------------------------------------------
function generateFallbackQuiz(topic, grade, language) {
  return `Question 1: ${topic} is important. True or False?\nAnswer: True\n\nQuestion 2: What describes ${topic}?\nA) Important concept\nB) Unrelated\nC) Advanced only\nD) None\nAnswer: A\n\nQuestion 3: How to apply ${topic}?\nAnswer: Explain practical uses.`;
}

function generateFallbackContent(topic, grade, language) {
  return `Let's learn about ${topic}.\n\n${topic} is an important concept for grade ${grade}.\n\nThink of ${topic} in everyday life.\n\nIn summary, ${topic} helps students learn.`;
}

// -------------------------------------------------------
// STATS ENDPOINT
// -------------------------------------------------------
router.get("/stats", async (req, res) => {
  const totalLessonRequests = apiCallCount + cacheHitCount;
  const lessonHitRate = totalLessonRequests > 0 
    ? ((cacheHitCount / totalLessonRequests) * 100).toFixed(2) 
    : 0;
  
  const totalAudioRequests = audioApiCalls + audioCacheHits;
  const audioHitRate = totalAudioRequests > 0
    ? ((audioCacheHits / totalAudioRequests) * 100).toFixed(2)
    : 0;

  const cachedLessonsCount = await countCacheByPattern("lesson_*");
  const cachedAudioCount = await countCacheByPattern("audio_*");

  res.json({
    lessons: {
      totalRequests: totalLessonRequests,
      apiCalls: apiCallCount,
      cacheHits: cacheHitCount,
      cacheHitRate: `${lessonHitRate}%`,
      cachedInRedis: cachedLessonsCount
    },
    audio: {
      totalRequests: totalAudioRequests,
      apiCalls: audioApiCalls,
      cacheHits: audioCacheHits,
      cacheHitRate: `${audioHitRate}%`,
      cachedInRedis: cachedAudioCount
    },
    modelUsed: "gemini-3.1-flash-lite"
  });
});

// -------------------------------------------------------
// CLEAR CACHE ENDPOINT
// -------------------------------------------------------
router.delete("/cache", async (req, res) => {
  const lessonKeys = await clearCacheByPattern("lesson_*");
  const audioKeys = await clearCacheByPattern("audio_*");
  
  res.json({ 
    message: "All caches cleared",
    cleared: {
      lessons: lessonKeys,
      audio: audioKeys
    }
  });
});

module.exports = router;