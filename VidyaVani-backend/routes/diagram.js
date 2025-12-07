// routes/diagram.js
const express = require("express");
const router = express.Router();

const {
  bedrock,
  InvokeModelCommand,
} = require("../awsClients");

const MODEL_ID = process.env.BEDROCK_IMAGE_MODEL_ID;

router.post("/", async (req, res) => {
  try {
    const { topic, grade, language, style } = req.body;

    if (!topic) {
      return res.status(400).json({ error: "Topic is required" });
    }

    const gradeLevel = grade || 6;
    const lang = language || "English";

    // Different prompt styles optimized for Titan
    const promptStyles = {
      // Simple icon-based diagram (best for avoiding text issues)
      iconic: {
        prompt: `Clean icon diagram showing ${topic}, simple geometric icons, arrows showing relationships, minimalist flat design, pastel color palette, white background, infographic style, no text, visual only, suitable for educational presentation`,
        negative: "text, letters, words, labels, complex details, realistic, photographic"
      },
      
      // Abstract conceptual
      abstract: {
        prompt: `Abstract visual representation of ${topic}, flowing shapes and connecting lines, modern minimal design, color-coded elements, clean composition, white background, educational infographic aesthetic, geometric abstraction`,
        negative: "text, writing, realistic, photographic, cluttered, detailed"
      },
      
      // Flowchart style (visual boxes and arrows)
      flow: {
        prompt: `Flowchart visualization of ${topic}, colored rectangular boxes connected by arrows, organized hierarchical layout, clean modern design, white background, simple flat style, process flow diagram, minimal aesthetic`,
        negative: "text inside boxes, labels, words, realistic, complex, photographic"
      },
      
      // Illustration style
      illustration: {
        prompt: `Educational illustration of ${topic}, simple cartoon style, clear visual metaphor, bright colors, white background, friendly design for grade ${gradeLevel} students, vector art style, clean lines`,
        negative: "text, labels, words, realistic photo, complex details, messy"
      }
    };

    const selectedStyle = promptStyles[style] || promptStyles.iconic;

    console.log("Generating diagram for:", topic);
    console.log("Using style:", style || 'iconic');

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
        cfgScale: 10.0,  // Fixed: Maximum is 10.0
        seed: Math.floor(Math.random() * 1000000),
        quality: "standard", // Changed from "premium" - might not be supported
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
      console.error("Unexpected response format:", Object.keys(data));
      return res.status(500).json({ error: "No image generated" });
    }

    res.json({ 
      imageBase64, 
      style: style || 'iconic' 
    });

  } catch (err) {
    console.error("Diagram route error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to get available styles
router.get("/styles", (req, res) => {
  res.json({
    styles: [
      { 
        value: "iconic", 
        label: "Icon-Based", 
        description: "Simple icons and symbols without text" 
      },
      { 
        value: "abstract", 
        label: "Abstract Shapes", 
        description: "Flowing shapes showing relationships" 
      },
      { 
        value: "flow", 
        label: "Flowchart", 
        description: "Boxes and arrows showing process" 
      },
      { 
        value: "illustration", 
        label: "Illustration", 
        description: "Friendly cartoon-style visual" 
      }
    ]
  });
});

module.exports = router;