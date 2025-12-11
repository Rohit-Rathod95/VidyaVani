// ============================================
// routes/lessons.js - OPTIMIZED VERSION
// ============================================
const express = require("express");
const router = express.Router();
const NodeCache = require('node-cache');

const {
  bedrock,
  polly,
  InvokeModelCommand,
  SynthesizeSpeechCommand,
} = require("../awsClients");

const MODEL_ID = process.env.BEDROCK_TEXT_MODEL_ID;
const IS_CLAUDE = MODEL_ID.includes('claude') || MODEL_ID.includes('anthropic');

// -------------------------------------------------------
// SHARED CACHE (7 days for lessons, 1 hour for audio)
// -------------------------------------------------------
const lessonCache = new NodeCache({ 
  stdTTL: 604800,
  checkperiod: 86400
});

const audioCache = new NodeCache({ 
  stdTTL: 3600, // 1 hour for auto-generated audio
  checkperiod: 600
});

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
  const configs = {
    "English": { voiceId: "Aditi", languageCode: "en-IN", engine: "standard" },
    "Hindi": { voiceId: "Aditi", languageCode: "hi-IN", engine: "standard" },
  };
  
  // All other languages fallback to Hindi
  return configs[language] || { 
    voiceId: "Aditi", 
    languageCode: "hi-IN", 
    engine: "standard",
    isFallback: language !== "English" && language !== "Hindi"
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
    const cached = audioCache.get(cacheKey);
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

  const params = {
    Text: ssmlText,
    TextType: "ssml",
    OutputFormat: "mp3",
    VoiceId: voiceConfig.voiceId,
    LanguageCode: voiceConfig.languageCode,
    Engine: voiceConfig.engine,
  };

  console.log("🔊 Generating audio:", {
    voice: voiceConfig.voiceId,
    language: voiceConfig.languageCode,
    textLength: audioText.length,
    cacheKey: cacheKey || 'none'
  });

  const command = new SynthesizeSpeechCommand(params);
  const response = await polly.send(command);

  const chunks = [];
  for await (const chunk of response.AudioStream) {
    chunks.push(chunk);
  }
  const audioBuffer = Buffer.concat(chunks);
  const audioBase64 = audioBuffer.toString("base64");

  const result = {
    audioBase64,
    voiceUsed: voiceConfig.voiceId,
    languageCode: voiceConfig.languageCode,
    isFallback: voiceConfig.isFallback,
    cached: false
  };

  // Cache the audio if cacheKey provided
  if (cacheKey) {
    audioCache.set(cacheKey, result);
    console.log(`💾 Cached audio: ${cacheKey}`);
  }

  audioApiCalls++;
  return result;
}

// -------------------------------------------------------
// MAIN ROUTE - GENERATE LESSON WITH AUTO-AUDIO
// -------------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const { topic, grade, language } = req.body;

    if (!topic) {
      return res.status(400).json({ error: "Topic is required" });
    }

    const gradeLevel = parseInt(grade) || 6;
    const lang = language || "English";

    const validationErrors = validateInput(topic, gradeLevel, lang);
    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }

    // Check lesson cache
    const lessonCacheKey = getLessonCacheKey(topic, gradeLevel, lang);
    const cachedLesson = lessonCache.get(lessonCacheKey);
    
    if (cachedLesson) {
      cacheHitCount++;
      console.log(`✅ Lesson Cache HIT: ${lessonCacheKey}`);
      
      // Check if audio is also cached
      const audioCacheKey = getAudioCacheKey(topic, gradeLevel, lang);
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

    // Generate lesson content
    let lessonContent = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts && !lessonContent) {
      try {
        lessonContent = await generateLesson(topic, gradeLevel, lang);
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
      lessonContent = generateFallbackContent(topic, gradeLevel, lang);
    }

    const parsedLesson = parseLesson(lessonContent, topic, gradeLevel);
    
    // Generate quiz
    const quiz = await generateQuiz(topic, gradeLevel, lang);

    const lesson = {
      title: `${topic} - Grade ${gradeLevel}`,
      ...parsedLesson,
      quiz: quiz,
      language: lang,
      grade: gradeLevel,
      timestamp: new Date().toISOString()
    };

    // Cache lesson
    lessonCache.set(lessonCacheKey, lesson);
    console.log(`💾 Cached lesson: ${lessonCacheKey}`);
    apiCallCount++;

    // Generate auto-audio
    let audioData = null;
    const audioCacheKey = getAudioCacheKey(topic, gradeLevel, lang);
    
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
async function generateLesson(topic, grade, language) {
  const languageNote = language !== 'English' 
    ? `CRITICAL: You MUST write your ENTIRE response in ${language} language.`
    : '';

  const prompt = `You are an expert teacher for grade ${grade} students.
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

  if (IS_CLAUDE) {
    return await callClaudeBedrock(prompt);
  } else {
    return await callTitanBedrock(prompt);
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
    if (IS_CLAUDE) {
      return await callClaudeBedrock(quizPrompt);
    } else {
      return await callTitanBedrock(quizPrompt);
    }
  } catch (error) {
    console.error("⚠️ Quiz generation failed:", error.message);
    return generateFallbackQuiz(topic, grade, language);
  }
}

// -------------------------------------------------------
// BEDROCK API HELPERS
// -------------------------------------------------------
async function callClaudeBedrock(prompt) {
  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 2048,
    temperature: 0.7,
    messages: [{ role: "user", content: prompt }]
  };

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(payload),
  });

  const response = await bedrock.send(command);
  const raw = new TextDecoder().decode(response.body);
  const bodyJson = JSON.parse(raw);
  return bodyJson.content?.[0]?.text?.trim() || "";
}

async function callTitanBedrock(prompt) {
  const payload = {
    inputText: prompt,
    textGenerationConfig: {
      maxTokenCount: 2048,
      temperature: 0.7,
      topP: 0.9
    }
  };

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(payload),
  });

  const response = await bedrock.send(command);
  const raw = new TextDecoder().decode(response.body);
  const bodyJson = JSON.parse(raw);
  return bodyJson.results?.[0]?.outputText?.trim() || "";
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
router.get("/stats", (req, res) => {
  const totalLessonRequests = apiCallCount + cacheHitCount;
  const lessonHitRate = totalLessonRequests > 0 
    ? ((cacheHitCount / totalLessonRequests) * 100).toFixed(2) 
    : 0;
  
  const totalAudioRequests = audioApiCalls + audioCacheHits;
  const audioHitRate = totalAudioRequests > 0
    ? ((audioCacheHits / totalAudioRequests) * 100).toFixed(2)
    : 0;

  res.json({
    lessons: {
      totalRequests: totalLessonRequests,
      apiCalls: apiCallCount,
      cacheHits: cacheHitCount,
      cacheHitRate: `${lessonHitRate}%`
    },
    audio: {
      totalRequests: totalAudioRequests,
      apiCalls: audioApiCalls,
      cacheHits: audioCacheHits,
      cacheHitRate: `${audioHitRate}%`
    },
    modelUsed: MODEL_ID
  });
});

// -------------------------------------------------------
// CLEAR CACHE ENDPOINT
// -------------------------------------------------------
router.delete("/cache", (req, res) => {
  const lessonKeys = lessonCache.keys().length;
  const audioKeys = audioCache.keys().length;
  
  lessonCache.flushAll();
  audioCache.flushAll();
  
  res.json({ 
    message: "All caches cleared",
    cleared: {
      lessons: lessonKeys,
      audio: audioKeys
    }
  });
});

module.exports = router;