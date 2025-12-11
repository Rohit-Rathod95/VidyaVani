const express = require("express");
const routerDoubt = express.Router();
const NodeCache = require('node-cache');

const {
  bedrock,
  polly,
  InvokeModelCommand,
  SynthesizeSpeechCommand,
} = require("../awsClients");

const MODEL_ID = process.env.BEDROCK_TEXT_MODEL_ID;
const IS_CLAUDE = MODEL_ID.includes('claude') || MODEL_ID.includes('anthropic');

// Shared caches
const doubtCache = new NodeCache({ 
  stdTTL: 3600, // 1 hour
  checkperiod: 600 
});

const doubtAudioCache = new NodeCache({
  stdTTL: 3600, // 1 hour
  checkperiod: 600
});

let doubtApiCalls = 0;
let doubtCacheHits = 0;
let doubtAudioApiCalls = 0;
let doubtAudioCacheHits = 0;

// -------------------------------------------------------
// HELPER: Generate cache keys
// -------------------------------------------------------
function getDoubtCacheKey(question, grade, language) {
  const hash = simpleHash(question.toLowerCase().trim());
  return `doubt_${hash}_${grade}_${language.toLowerCase()}`;
}

function getDoubtAudioCacheKey(answer, language) {
  const hash = simpleHash(answer.toLowerCase().trim());
  return `doubt_audio_${hash}_${language.toLowerCase()}`;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// -------------------------------------------------------
// POST /api/doubt - Answer with auto-audio
// -------------------------------------------------------
routerDoubt.post("/", async (req, res) => {
  try {
    const { question, topic, grade, language } = req.body;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({ error: "Question is required" });
    }

    if (question.length > 500) {
      return res.status(400).json({ 
        error: "Question too long (max 500 characters)",
        maxLength: 500,
        currentLength: question.length
      });
    }

    const gradeLevel = parseInt(grade) || 6;
    const lang = language || "English";

    console.log(`❓ Doubt: "${question.substring(0, 50)}..." | Grade: ${gradeLevel} | Lang: ${lang}`);

    // Check doubt cache
    const doubtCacheKey = getDoubtCacheKey(question, gradeLevel, lang);
    const cachedAnswer = doubtCache.get(doubtCacheKey);
    
    if (cachedAnswer) {
      doubtCacheHits++;
      console.log(`✅ Doubt Cache HIT`);
      
      // Check audio cache
      const audioCacheKey = getDoubtAudioCacheKey(cachedAnswer, lang);
      let audioData = null;
      
      try {
        audioData = await generateDoubtAudio(cachedAnswer, lang, audioCacheKey);
      } catch (audioErr) {
        console.warn("⚠️ Audio generation failed:", audioErr.message);
      }
      
      return res.json({ 
        answer: cachedAnswer,
        audio: audioData,
        cached: true,
        stats: {
          doubtApiCalls,
          doubtCacheHits,
          doubtAudioApiCalls,
          doubtAudioCacheHits
        }
      });
    }

    console.log(`❌ Doubt Cache MISS - Generating answer`);

    // Generate answer
    const languageNote = lang !== 'English' 
      ? `CRITICAL: Write your ENTIRE answer in ${lang} language only.`
      : '';

    const prompt = `You are a helpful teacher for grade ${gradeLevel} students.
${languageNote}

Student's Question: ${question}
${topic ? `Related Topic: ${topic}` : ''}

Provide a clear, simple answer in ${lang} suitable for grade ${gradeLevel} students.
- Break down complex concepts into easy steps
- Use examples they can relate to
- Keep the answer concise (2-3 paragraphs maximum)
- Be encouraging and supportive
- Don't mention that you're an AI or assistant`;

    let answer;
    if (IS_CLAUDE) {
      answer = await callClaudeBedrock(prompt);
    } else {
      answer = await callTitanBedrock(prompt);
    }

    const cleanAnswer = answer.trim();

    if (!cleanAnswer || cleanAnswer.length < 20) {
      throw new Error("Generated answer too short or empty");
    }

    // Cache the answer
    doubtCache.set(doubtCacheKey, cleanAnswer);
    console.log(`💾 Cached doubt answer`);
    doubtApiCalls++;

    // Generate auto-audio
    let audioData = null;
    const audioCacheKey = getDoubtAudioCacheKey(cleanAnswer, lang);
    
    try {
      console.log("🎵 Generating audio for doubt answer...");
      audioData = await generateDoubtAudio(cleanAnswer, lang, audioCacheKey);
      console.log("✅ Audio generated for doubt answer");
    } catch (audioErr) {
      console.warn("⚠️ Audio generation failed:", audioErr.message);
    }

    res.json({ 
      answer: cleanAnswer,
      audio: audioData,
      cached: false,
      stats: {
        doubtApiCalls,
        doubtCacheHits,
        doubtAudioApiCalls,
        doubtAudioCacheHits
      }
    });

  } catch (err) {
    console.error("❌ Doubt answering error:", err);
    
    let errorMessage = "Failed to answer question";
    let statusCode = 500;

    if (err.name === 'ThrottlingException') {
      errorMessage = "Too many requests. Please wait a moment.";
      statusCode = 429;
    } else if (err.name === 'ValidationException') {
      errorMessage = "Invalid question format";
      statusCode = 400;
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// -------------------------------------------------------
// HELPER: Generate Doubt Audio
// -------------------------------------------------------
async function generateDoubtAudio(text, language, cacheKey = null) {
  // Check cache first
  if (cacheKey) {
    const cached = doubtAudioCache.get(cacheKey);
    if (cached) {
      doubtAudioCacheHits++;
      console.log(`✅ Doubt Audio Cache HIT`);
      return { ...cached, cached: true };
    }
  }

  const voiceConfig = getVoiceConfig(language);
  
  const maxLength = 3000;
  let audioText = text;
  if (text.length > maxLength) {
    audioText = text.substring(0, maxLength) + "...";
    console.log(`⚠️ Doubt audio truncated from ${text.length} to ${maxLength}`);
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
    cached: false
  };

  if (cacheKey) {
    doubtAudioCache.set(cacheKey, result);
    console.log(`💾 Cached doubt audio`);
  }

  doubtAudioApiCalls++;
  return result;
}

// Helper: Voice Config
function getVoiceConfig(language) {
  const configs = {
    "English": { voiceId: "Aditi", languageCode: "en-IN", engine: "standard" },
    "Hindi": { voiceId: "Aditi", languageCode: "hi-IN", engine: "standard" },
  };
  return configs[language] || configs["Hindi"];
}

// Helper: Build SSML
function buildSSML(text) {
  const cleanText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  return `<speak><prosody rate="medium" pitch="medium">${cleanText}</prosody></speak>`;
}

// Helper: Call Claude
async function callClaudeBedrock(prompt) {
  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 1024,
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

// Helper: Call Titan
async function callTitanBedrock(prompt) {
  const payload = {
    inputText: prompt,
    textGenerationConfig: {
      maxTokenCount: 1024,
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
// GET /api/doubt/stats
// -------------------------------------------------------
routerDoubt.get("/stats", (req, res) => {
  const totalDoubts = doubtApiCalls + doubtCacheHits;
  const doubtHitRate = totalDoubts > 0 ? ((doubtCacheHits / totalDoubts) * 100).toFixed(2) : 0;
  
  const totalAudio = doubtAudioApiCalls + doubtAudioCacheHits;
  const audioHitRate = totalAudio > 0 ? ((doubtAudioCacheHits / totalAudio) * 100).toFixed(2) : 0;
  
  res.json({
    doubts: {
      totalQuestions: totalDoubts,
      apiCalls: doubtApiCalls,
      cacheHits: doubtCacheHits,
      cacheHitRate: `${doubtHitRate}%`
    },
    audio: {
      totalRequests: totalAudio,
      apiCalls: doubtAudioApiCalls,
      cacheHits: doubtAudioCacheHits,
      cacheHitRate: `${audioHitRate}%`
    }
  });
});

// Clear cache
routerDoubt.delete("/cache", (req, res) => {
  const doubtKeys = doubtCache.keys().length;
  const audioKeys = doubtAudioCache.keys().length;
  
  doubtCache.flushAll();
  doubtAudioCache.flushAll();
  
  res.json({ 
    message: "Doubt caches cleared",
    cleared: { doubts: doubtKeys, audio: audioKeys }
  });
});

module.exports = routerDoubt;