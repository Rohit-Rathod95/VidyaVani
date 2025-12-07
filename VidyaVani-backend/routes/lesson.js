const express = require("express");
const router = express.Router();

const {
  bedrock,
  InvokeModelCommand,
} = require("../awsClients");

const MODEL_ID = process.env.BEDROCK_TEXT_MODEL_ID;

// ------------------------------
// MAIN ROUTE
// ------------------------------
router.post("/", async (req, res) => {
  try {
    const { topic, grade, language } = req.body;

    if (!topic) {
      return res.status(400).json({ error: "Topic is required" });
    }

    const gradeLevel = grade || 6;
    const lang = language || "English";

    // Try different prompt approaches
    let lessonContent = null;
    let attempts = 0;
    const maxAttempts = 3;

    // Prompt variations to try if first fails
    const promptVariations = [
      // Variation 1: Simple and direct
      `Write 4 paragraphs about ${topic} for grade ${gradeLevel} students in ${lang}.

Paragraph 1: Introduction
Paragraph 2: Detailed explanation
Paragraph 3: Real-world analogy
Paragraph 4: Summary

Write naturally and clearly.`,

      // Variation 2: More educational context
      `You are a ${lang} teacher. Teach ${topic} to grade ${gradeLevel} students.

Write 4 clear paragraphs:
- First paragraph: Introduce the concept
- Second paragraph: Explain how it works
- Third paragraph: Give a relatable example
- Fourth paragraph: Summarize the key points`,

      // Variation 3: Story-like approach
      `Create an educational lesson about ${topic} for ${gradeLevel} grade students in ${lang}. Write in a friendly, engaging way.

Write 4 paragraphs that cover:
1. What this topic is about
2. How this concept works in detail
3. A comparison to everyday life
4. A brief summary

Be clear and informative.`
    ];

    // Try each prompt variation until one works
    while (attempts < maxAttempts && !lessonContent) {
      try {
        console.log(`Attempt ${attempts + 1} for topic: ${topic}`);
        lessonContent = await callBedrock(promptVariations[attempts]);
        
        // Check if response is valid
        if (!lessonContent || 
            lessonContent.includes("unable to respond") || 
            lessonContent.includes("cannot assist") ||
            lessonContent.length < 100) {
          console.log("Invalid response, trying next variation...");
          lessonContent = null;
          attempts++;
        } else {
          console.log("Valid response received!");
          break;
        }
      } catch (error) {
        console.error(`Attempt ${attempts + 1} failed:`, error.message);
        attempts++;
        if (attempts >= maxAttempts) {
          throw error;
        }
      }
    }

    // If all attempts failed, use fallback content
    if (!lessonContent) {
      console.log("All attempts failed, using fallback content");
      lessonContent = generateFallbackContent(topic, gradeLevel, lang);
    }

    // Parse content into paragraphs
    const paragraphs = lessonContent
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 20);

    const lesson = {
      title: `${topic} - Grade ${gradeLevel}`,
      introduction: paragraphs[0] || generateFallbackIntro(topic, gradeLevel),
      explanation: paragraphs[1] || generateFallbackExplanation(topic, gradeLevel),
      analogy: paragraphs[2] || generateFallbackAnalogy(topic, gradeLevel),
      recap: paragraphs[3] || paragraphs[paragraphs.length - 1] || generateFallbackRecap(topic, gradeLevel)
    };

    res.json({ lesson });

  } catch (err) {
    console.error("Lesson route error:", err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// HELPER: Call Bedrock
// -------------------------------------------------------
async function callBedrock(prompt) {
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

  const outputText = bodyJson.results?.[0]?.outputText || "";
  return outputText.trim();
}

// -------------------------------------------------------
// FALLBACK CONTENT GENERATORS
// -------------------------------------------------------
function generateFallbackContent(topic, grade, language) {
  return `This lesson introduces students to ${topic}, an important concept in their grade ${grade} curriculum.

${topic} involves understanding fundamental principles and their applications. This concept helps students develop critical thinking skills and connects to real-world scenarios they may encounter.

To understand ${topic} better, we can compare it to everyday experiences. Just like how we observe patterns in nature or use logic to solve problems, ${topic} follows similar principles that can be applied practically.

In summary, ${topic} is a valuable area of study that builds foundational knowledge. Students who grasp these concepts will be better prepared for advanced topics and real-world applications in the future.`;
}

function generateFallbackIntro(topic, grade) {
  return `Welcome to this lesson on ${topic}. This is an important concept for grade ${grade} students to understand as it forms the foundation for many advanced topics.`;
}

function generateFallbackExplanation(topic, grade) {
  return `${topic} is a fundamental concept that involves understanding key principles and their applications. This topic helps students develop critical thinking and problem-solving skills that are essential for their academic growth at the grade ${grade} level.`;
}

function generateFallbackAnalogy(topic, grade) {
  return `To better understand ${topic}, think of it like everyday situations you encounter. Just as patterns exist in nature and logic helps us solve problems, ${topic} follows similar principles that can be observed and applied in practical ways.`;
}

function generateFallbackRecap(topic, grade) {
  return `In conclusion, ${topic} is an essential concept for grade ${grade} students. Understanding these principles will help you build a strong foundation for future learning and real-world applications.`;
}

module.exports = router;