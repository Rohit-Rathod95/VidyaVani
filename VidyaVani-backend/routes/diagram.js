// routes/diagram.js
const express = require("express");
const router = express.Router();
const NodeCache = require('node-cache');

const {
  bedrock,
  InvokeModelCommand,
} = require("../awsClients");

const MODEL_ID = process.env.BEDROCK_IMAGE_MODEL_ID;

// -------------------------------------------------------
// CACHE SETUP (7 days TTL)
// -------------------------------------------------------
const diagramCache = new NodeCache({ 
  stdTTL: 604800, // 7 days
  checkperiod: 86400
});

// -------------------------------------------------------
// TRACKING STATS
// -------------------------------------------------------
let imageApiCallCount = 0;
let imageCacheHitCount = 0;

// -------------------------------------------------------
// VALIDATION CONSTANTS
// -------------------------------------------------------
const VALID_STYLES = ['iconic', 'abstract', 'flow', 'illustration', 'diagram'];
const VALID_LANGUAGES = ['English', 'Hindi', 'Marathi', 'Tamil', 'Telugu', 'Kannada', 'Bengali', 'Gujarati'];

// -------------------------------------------------------
// HELPER: Generate Cache Key
// -------------------------------------------------------
function getDiagramCacheKey(topic, grade, style) {
  return `img_${topic.toLowerCase().trim()}_${grade}_${style}`;
}

// -------------------------------------------------------
// HELPER: Check if Topic Needs Visual (EXPANDED LIST)
// -------------------------------------------------------
function needsVisualDiagram(topic) {
  const visualTopics = [
    // Biology & Life Science
    'photosynthesis', 'cell', 'mitosis', 'meiosis', 'dna', 'rna', 'gene',
    'reproduction', 'sexual reproduction', 'asexual reproduction', 'fertilization',
    'plant', 'flower', 'leaf', 'root', 'stem', 'seed',
    'animal', 'mammal', 'bird', 'fish', 'reptile', 'amphibian', 'insect',
    'food chain', 'food web', 'ecosystem', 'habitat', 'biodiversity',
    'human body', 'heart', 'brain', 'lung', 'kidney', 'liver', 'stomach',
    'digestive system', 'respiratory system', 'circulatory system', 'nervous system',
    'skeletal system', 'muscular system', 'immune system', 'reproductive system',
    'blood', 'bone', 'muscle', 'tissue', 'organ','heridity',
    'evolution', 'natural selection', 'adaptation', 'species',
    
    // Physics & Energy
    'force', 'motion', 'velocity', 'acceleration', 'gravity', 'friction',
    'energy', 'kinetic', 'potential', 'mechanical', 'thermal',
    'electricity', 'circuit', 'voltage', 'current', 'resistance',
    'magnet', 'magnetism', 'electromagnetic', 'wave', 'frequency',
    'light', 'reflection', 'refraction', 'prism', 'spectrum',
    'sound', 'vibration', 'amplitude', 'wavelength',
    'newton', 'law of motion', 'thermodynamics',
    
    // Chemistry
    'atom', 'molecule', 'element', 'compound', 'mixture',
    'chemical reaction', 'equation', 'bond', 'ionic', 'covalent',
    'periodic table', 'metal', 'non-metal', 'noble gas',
    'acid', 'base', 'ph', 'neutral', 'salt',
    'oxidation', 'reduction', 'combustion', 'synthesis',
    
    // Earth & Space Science
    'solar system', 'planet', 'star', 'galaxy', 'universe',
    'earth', 'atmosphere', 'layer', 'ozone', 'greenhouse',
    'water cycle', 'evaporation', 'condensation', 'precipitation',
    'rock cycle', 'igneous', 'sedimentary', 'metamorphic',
    'volcano', 'earthquake', 'plate tectonic', 'fault', 'tsunami',
    'mountain', 'valley', 'river', 'ocean', 'lake', 'glacier',
    'weather', 'climate', 'wind', 'rain', 'storm', 'hurricane',
    'season', 'rotation', 'revolution', 'orbit', 'eclipse',
    
    // Mathematics (Geometry & Shapes)
    'geometry', 'triangle', 'circle', 'square', 'rectangle', 'pentagon',
    'angle', 'shape', 'polygon', 'quadrilateral', 'parallel', 'perpendicular',
    'coordinate', 'graph', 'axis', 'slope', 'line',
    'fraction', 'decimal', 'percentage', 'ratio', 'proportion',
    'volume', 'area', 'perimeter', 'surface',
    
    // Technology & Engineering
    'machine', 'lever', 'pulley', 'wheel', 'axle', 'gear',
    'simple machine', 'complex machine', 'mechanical advantage',
    'computer', 'hardware', 'software', 'network', 'algorithm',
    'robot', 'artificial intelligence', 'sensor',
    
    // General Science Processes
    'cycle', 'process', 'system', 'structure', 'diagram',
    'experiment', 'observation', 'hypothesis', 'method',
    'classification', 'taxonomy', 'hierarchy'
  ];
  
  const topicLower = topic.toLowerCase().trim();
  
  // Check if topic contains any visual keywords
  const matches = visualTopics.some(vt => topicLower.includes(vt));
  
  // Log for debugging
  if (!matches) {
    console.log(`⚠️  Topic "${topic}" not found in visual list`);
  }
  
  return matches;
}

// -------------------------------------------------------
// MAIN ROUTE - GENERATE DIAGRAM
// -------------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const { topic, grade, language, style } = req.body;

    // Validation
    if (!topic) {
      return res.status(400).json({ error: "Topic is required" });
    }

    if (topic.length > 200) {
      return res.status(400).json({ error: "Topic too long (max 200 characters)" });
    }

    const gradeLevel = parseInt(grade) || 6;
    const lang = language || "English";
    const diagramStyle = style || "iconic";

    // Validate style
    if (!VALID_STYLES.includes(diagramStyle)) {
      return res.status(400).json({ 
        error: `Invalid style. Must be one of: ${VALID_STYLES.join(', ')}`
      });
    }

    // 🔥 CHECK IF TOPIC NEEDS A DIAGRAM
    const needsDiagram = needsVisualDiagram(topic);
    
    if (!needsDiagram) {
      console.log(`⚠️  Topic "${topic}" may not need a diagram - skipping to save API calls`);
      return res.json({ 
        imageBase64: null,
        style: diagramStyle,
        message: "This topic doesn't require a visual diagram",
        suggestion: "Visual may not add significant value for this concept"
      });
    }

    console.log(`✅ Topic "${topic}" benefits from a visual diagram`);

    // 🔥 CHECK CACHE FIRST
    const cacheKey = getDiagramCacheKey(topic, gradeLevel, diagramStyle);
    const cachedDiagram = diagramCache.get(cacheKey);
    
    if (cachedDiagram) {
      imageCacheHitCount++;
      const totalRequests = imageApiCallCount + imageCacheHitCount;
      const savingsPercent = ((imageCacheHitCount / totalRequests) * 100).toFixed(1);
      
      console.log(`✅ Diagram Cache HIT for: ${cacheKey} - FREE!`);
      console.log(`📊 Image Stats - API Calls: ${imageApiCallCount}, Cache Hits: ${imageCacheHitCount}, Savings: ${savingsPercent}%`);
      
      return res.json({ 
        imageBase64: cachedDiagram.imageBase64,
        style: diagramStyle,
        cached: true,
        stats: {
          apiCalls: imageApiCallCount,
          cacheHits: imageCacheHitCount,
          savingsPercent: `${savingsPercent}%`
        }
      });
    }
    
    console.log(`❌ Diagram Cache MISS for: ${cacheKey} - Using API`);

    // Enhanced prompt styles
    const promptStyles = {
      iconic: {
        prompt: `Educational icon diagram illustrating ${topic}, simple geometric icons and symbols, arrows showing relationships and flow, minimalist flat design, pastel color palette, white background, infographic style, clear visual hierarchy, suitable for grade ${gradeLevel} students, no text labels, visual communication only`,
        negative: "text, letters, words, labels, annotations, complex details, realistic photography, cluttered, messy, blurry"
      },
      
      abstract: {
        prompt: `Abstract visual concept map of ${topic}, flowing organic shapes with connecting lines, modern minimal design, color-coded elements representing different aspects, clean geometric composition, white background, educational infographic aesthetic, suitable for grade ${gradeLevel}, clear visual hierarchy`,
        negative: "text, writing, labels, realistic photography, cluttered, detailed textures, messy"
      },
      
      flow: {
        prompt: `Flowchart style visualization of ${topic}, colorful rectangular and rounded boxes connected by directional arrows, organized hierarchical layout, clean modern flat design, white background, simple geometric style, process flow diagram, clear progression, suitable for grade ${gradeLevel} education`,
        negative: "text inside boxes, labels, words, annotations, realistic style, photographic, complex details, messy"
      },
      
      illustration: {
        prompt: `Educational cartoon illustration of ${topic}, simple friendly drawing style, clear visual metaphor, bright appealing colors, white background, child-friendly design for grade ${gradeLevel} students, clean vector art aesthetic, bold outlines, easy to understand visual`,
        negative: "text, labels, words, captions, realistic photo style, complex details, messy, dark, scary"
      },

      diagram: {
        prompt: `Scientific educational diagram of ${topic}, clean technical illustration style, color-coded components, clear visual structure, white background, organized layout suitable for grade ${gradeLevel}, simplified schematic style, easy to understand visual representation`,
        negative: "text labels, words, annotations, photorealistic, cluttered, complex details, messy"
      }
    };

    const selectedStyle = promptStyles[diagramStyle] || promptStyles.iconic;

    console.log(`🎨 Generating diagram for: "${topic}" (Style: ${diagramStyle})`);

    const body = {
      taskType: "TEXT_IMAGE",
      textToImageParams: {
        text: selectedStyle.prompt,
        negativeText: selectedStyle.negative
      },
      imageGenerationConfig: {
        numberOfImages: 1,
        height: 1024,
        width: 1024,
        cfgScale: 8.0,
        seed: Math.floor(Math.random() * 2147483647),
        quality: "standard",
      },
    };

    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(body),
    });

    const response = await bedrock.send(command);
    const raw = new TextDecoder().decode(response.body);
    const data = JSON.parse(raw);

    let imageBase64;
    
    if (data.images && data.images[0]) {
      imageBase64 = data.images[0];
    } else if (data.artifacts && data.artifacts[0]) {
      imageBase64 = data.artifacts[0].base64;
    } else {
      console.error("❌ Unexpected response format:", Object.keys(data));
      return res.status(500).json({ 
        error: "No image generated",
        responseKeys: Object.keys(data)
      });
    }

    // 🔥 STORE IN CACHE
    diagramCache.set(cacheKey, { imageBase64, style: diagramStyle });
    console.log(`💾 Cached diagram for: ${cacheKey}`);

    imageApiCallCount++;
    const totalRequests = imageApiCallCount + imageCacheHitCount;
    const savingsPercent = imageCacheHitCount > 0 
      ? ((imageCacheHitCount / totalRequests) * 100).toFixed(1) 
      : 0;
    
    console.log(`📊 Image Stats - API Calls: ${imageApiCallCount}, Cache Hits: ${imageCacheHitCount}, Savings: ${savingsPercent}%`);

    res.json({ 
      imageBase64,
      style: diagramStyle,
      cached: false,
      stats: {
        apiCalls: imageApiCallCount,
        cacheHits: imageCacheHitCount,
        savingsPercent: `${savingsPercent}%`
      }
    });

  } catch (err) {
    console.error("❌ Diagram route error:", err);
    
    let errorMessage = "Failed to generate diagram";
    let statusCode = 500;

    if (err.name === 'ThrottlingException') {
      errorMessage = "Too many image generation requests. Please try again in a moment.";
      statusCode = 429;
    } else if (err.name === 'ValidationException') {
      errorMessage = "Invalid image generation request. Check your parameters.";
      statusCode = 400;
    } else if (err.message && err.message.includes('content policy')) {
      errorMessage = "Content policy violation. Please try a different topic or style.";
      statusCode = 400;
    }

    res.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// -------------------------------------------------------
// ENDPOINT: Get Available Styles
// -------------------------------------------------------
router.get("/styles", (req, res) => {
  res.json({
    styles: [
      { 
        value: "iconic", 
        label: "Icon-Based", 
        description: "Simple icons and symbols without text",
        bestFor: ["Processes", "Relationships", "Comparisons"]
      },
      { 
        value: "abstract", 
        label: "Abstract Shapes", 
        description: "Flowing shapes showing relationships",
        bestFor: ["Concepts", "Systems", "Connections"]
      },
      { 
        value: "flow", 
        label: "Flowchart", 
        description: "Boxes and arrows showing process",
        bestFor: ["Sequences", "Workflows", "Algorithms"]
      },
      { 
        value: "illustration", 
        label: "Illustration", 
        description: "Friendly cartoon-style visual",
        bestFor: ["Biological topics", "Nature", "Stories"]
      },
      { 
        value: "diagram", 
        label: "Scientific Diagram", 
        description: "Technical educational diagram",
        bestFor: ["Anatomy", "Chemistry", "Physics", "Biology"]
      }
    ],
    defaultStyle: "iconic"
  });
});

// -------------------------------------------------------
// ENDPOINT: Check if Topic Needs Diagram
// -------------------------------------------------------
router.post("/check", (req, res) => {
  const { topic } = req.body;
  
  if (!topic) {
    return res.status(400).json({ error: "Topic is required" });
  }

  const needsDiagram = needsVisualDiagram(topic);
  
  res.json({
    topic,
    needsDiagram,
    recommendation: needsDiagram 
      ? "✅ Visual diagram recommended for this topic"
      : "ℹ️  This topic can be explained well with text alone",
    suggestedStyle: needsDiagram ? getSuggestedStyle(topic) : null
  });
});

// -------------------------------------------------------
// HELPER: Suggest Best Style for Topic
// -------------------------------------------------------
function getSuggestedStyle(topic) {
  const topicLower = topic.toLowerCase();
  
  // Flowchart topics
  if (topicLower.includes('cycle') || 
      topicLower.includes('process') || 
      topicLower.includes('steps') ||
      topicLower.includes('algorithm')) {
    return 'flow';
  }
  
  // Illustration topics
  if (topicLower.includes('animal') || 
      topicLower.includes('plant') || 
      topicLower.includes('ecosystem') ||
      topicLower.includes('food chain')) {
    return 'illustration';
  }
  
  // Scientific diagram topics (including reproduction)
  if (topicLower.includes('cell') || 
      topicLower.includes('atom') || 
      topicLower.includes('system') ||
      topicLower.includes('structure') ||
      topicLower.includes('reproduction') ||
      topicLower.includes('anatomy') ||
      topicLower.includes('organ')) {
    return 'diagram';
  }
  
  // Abstract topics
  if (topicLower.includes('concept') || 
      topicLower.includes('relationship') || 
      topicLower.includes('connection')) {
    return 'abstract';
  }
  
  return 'iconic';
}

// -------------------------------------------------------
// ENDPOINT: Image Stats
// -------------------------------------------------------
router.get("/stats", (req, res) => {
  const totalRequests = imageApiCallCount + imageCacheHitCount;
  const cacheHitRate = totalRequests > 0 
    ? ((imageCacheHitCount / totalRequests) * 100).toFixed(2) 
    : 0;
  
  const cachedKeys = diagramCache.keys();

  res.json({
    totalRequests,
    apiCalls: imageApiCallCount,
    cacheHits: imageCacheHitCount,
    cacheHitRate: `${cacheHitRate}%`,
    cachedDiagrams: cachedKeys.length,
    message: `Saving ${cacheHitRate}% of image generation quota! 🎨`
  });
});

// -------------------------------------------------------
// ENDPOINT: Clear Cache
// -------------------------------------------------------
router.delete("/cache", (req, res) => {
  const { topic, grade, style } = req.query;
  
  if (topic && grade && style) {
    const cacheKey = getDiagramCacheKey(topic, parseInt(grade), style);
    const deleted = diagramCache.del(cacheKey);
    
    if (deleted) {
      res.json({ 
        message: `Cleared diagram cache for: ${cacheKey}`,
        cleared: 1
      });
    } else {
      res.json({ 
        message: `No cached diagram found for: ${cacheKey}`,
        cleared: 0
      });
    }
  } else {
    const keysCleared = diagramCache.keys().length;
    diagramCache.flushAll();
    
    res.json({ 
      message: "All diagram cache cleared",
      cleared: keysCleared
    });
  }
});

module.exports = router;