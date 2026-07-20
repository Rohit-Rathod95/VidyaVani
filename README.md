# 🎓 VidyaVani: Voice-First AI Substitute Teacher for Government Schools

> **Pitch**: Transforming idle smartboards in resource-constrained classrooms into autonomous, multilingual, voice-first learning assistants that generate lessons, diagrams, and answer student doubts in real-time.

---

## 📌 Problem Statement

In many rural and government schools in India, acute teacher absenteeism and vacancy rates lead to "non-instructional" school days. While schools are increasingly equipped with digital smartboards, these boards remain offline or underutilized due to a lack of structured digital content and teachers to navigate them. 

**VidyaVani** solves this by providing a voice-first, interactive, and autonomous digital substitute teacher. By utilizing generative AI, VidyaVani transforms classroom screens into active hubs that can:
1. Conduct complete lessons based on a single spoken or typed topic.
2. Render contextually relevant visual aids and diagrams.
3. Actively listen to and answer students' spoken doubts in their native regional language.

---

## 🚀 Key Features

### 1. Voice-First Multilingual Lesson Builder
*   **Speech-to-Text Topic Input**: Teachers or class monitors can trigger the lesson generator using voice commands in 9 Indian languages.
*   **Pedagogical Lesson Structure**: Generates lessons structured into four sections (Introduction, Detailed Explanation, Daily-life Analogy, and Quick Recap) tailored to a specific student grade level (1–12).
*   **Integrated Quizzes**: Automatically appends 3 graded questions (Easy, Medium, Hard) at the end of each lesson to verify comprehension.

### 2. Contextual Visual Aid Generator
*   **Visual Relevance Analyzer**: Scans the lesson topic against a comprehensive database of visual subjects (in Biology, Chemistry, Physics, Earth Sciences, Math, and Engineering) to determine if a diagram adds value.
*   **Diagram Stylization**: Generates high-quality vector-style, flowchart, iconic, abstract, or scientific illustrations matching the student's grade level and style selection.

### 3. Native Voice Narration & Interactive Doubt Solver
*   **Automatic Narrator**: Automatically synthesizes and streams voice lessons utilizing localized voice settings so that students can listen while reading.
*   **Classroom Doubt Solving**: Students can click the microphone button, ask doubts (e.g., *"Can you give another example?"* or *"Why does this happen?"*), and receive an instant spoken answer from the AI Teacher.

### 4. Smart Cost & Performance Caching
*   **Dual-Layer Caching**: Embeds a smart caching layer that caches expensive LLM answers, synthesized audio files, and generated diagrams.
*   **Analytics Control Panel**: A dedicated administrative dashboard showing real-time cache hit rates, total requests, and estimated cost savings on API usage.

---

## 🗺️ System Architecture

### Request Lifecycle Flow (Voice-First Lesson Generation)

The diagram below represents the complete end-to-end request lifecycle when a user initiates a lesson via voice input:

```
[User Mic] 
    │
    ▼ (WebM/MP4 Audio)
[Browser MediaRecorder] ──(FileReader Base64 Conversion)──► [React Frontend App.jsx]
                                                                  │
                                                                  ▼ POST /api/transcribe
                                                            [Express Backend]
                                                                  │
                                                                  ├─► [Deepgram SDK] ──► (Nova-3 STT)
                                                                  │          │
                                                                  ◄──────────┴─ (Plain Text Transcript)
                                                                  │
                                                        (Sends Transcription)
                                                                  │
                                                                  ▼
                                                      [React Frontend] (handleGenerate)
                                                                  │
                                         ┌────────────────────────┴────────────────────────┐
                                         ▼ (Fetch 1 - Sequential)                          ▼ (Fetch 2 - Sequential)
                                 POST /api/lesson                                  POST /api/diagram
                                 [Express Backend]                                 [Express Backend]
                                         │                                                 │
                                 ┌───────┴───────┐                                 ┌───────┴───────┐
                          (Cache HIT)     (Cache MISS)                      (Cache HIT)     (Cache MISS)
                                 │               │                                 │               │
                                 ▼               ├─► [Google Gemini LLM]           ▼               ├─► [Pollinations.ai Image]
                          [lessonCache]          │   (Lesson Text Content)   [diagramCache]        │   (Diagram base64)
                                 │               ├─► [Google Gemini LLM]           │               │
                                 │               │   (Lesson Quiz Content)         │               ◄───────┘
                                 │               │                                 │
                                 ◄───────────────┴─ (Parsed Lesson Object)          ◄───────────────┘
                                 │                                                 │
                                 ├─► [AWS Polly] ◄── (Cache MISS)                  │
                                 │   (SSML TTS Audio)                              │
                                 ▼                                                 ▼
                          [audioCache] (1h TTL)                             [diagramCache] (7d TTL)
                                 │                                                 │
                                 ◄─────────────────────────────────────────────────┘
                                 │
                                 ▼ (Lesson Text + Polly Audio Base64 + Diagram Base64)
                          [React Frontend] ──► Render smartboard view + Autoplay Audio
```

### Async & Queueing Strategy
*   **Concurrency**: Currently, backend operations are handled synchronously on a per-request basis. External API calls to Google Gemini, Pollinations.ai, and AWS Polly are made within each controller.
*   **Frontend Sequential Bottleneck**: The React client fetches `/api/lesson` first, updates state with the lesson text and base64 audio, and then triggers `/api/diagram`. This serial execution adds unnecessary latency before the visual diagram renders.

---

## 💻 Tech Stack

| Layer | Technologies | Details |
| :--- | :--- | :--- |
| **Frontend** | React, Vite, HTML5 WebRTC (MediaRecorder API) | Dynamic rendering, browser audio capture, state management |
| **Backend** | Node.js, Express | REST APIs, buffer management, error boundary handlers |
| **AI / ML** | Google Gemini (gemini-1.5-flash), Pollinations.ai, AWS Polly, Deepgram (Nova-3) | Text generation, image generation, text-to-speech, speech-to-text |
| **Infrastructure** | Node-Cache (In-Memory) | Multi-tier TTL caching layer for cost and latency reduction |

---

## 🛠️ Detailed Setup Instructions

### 📋 Prerequisites
*   Node.js (v18.x or above)
*   npm (v9.x or above)
*   AWS Account with access enabled for **AWS Polly** (Aditi voice), Google Gemini API Key, and Deepgram API Key.
*   Deepgram Account with a valid API key.

### 🔑 Environment Variables Configuration
Create a `.env` file in the root of `VidyaVani-backend/`:

```env
PORT=5000

# AWS Credentials
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key

# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key_here

# Deepgram STT
DEEPGRAM_API_KEY=your_deepgram_api_key

# Polly Configuration
POLLY_VOICE_ID=Aditi
```

### ⚙️ Installation & Running Locally

#### 1. Clone the repository and navigate into it:
```bash
git clone <repository_url>
cd VidyaVani
```

#### 2. Run the Backend:
```bash
cd VidyaVani-backend
npm install
node app.js
```
The backend service will run on `http://localhost:5000`.

#### 3. Run the Frontend:
```bash
cd ../vidyavani-frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 📖 API Documentation

### 1. Transcription API
*   **Endpoint**: `POST /api/transcribe`
*   **Description**: Converts base64-encoded WebM/MP4 recorded audio into text using Deepgram.
*   **Request Body**:
    ```json
    {
      "audioData": "GkXfo6NChoEBQveBAULygQST...",
      "language": "Hindi"
    }
    ```
*   **Response (200 OK)**:
    ```json
    {
      "success": true,
      "transcription": "प्रकाश संश्लेषण क्या है",
      "raw": { ... }
    }
    ```

### 2. Lesson Generation API
*   **Endpoint**: `POST /api/lesson`
*   **Description**: Generates lesson paragraphs, a quiz, and synthesizes speech audio. Uses `lessonCache` and `audioCache`.
*   **Request Body**:
    ```json
    {
      "topic": "Photosynthesis",
      "grade": 7,
      "language": "English"
    }
    ```
*   **Response (200 OK)**:
    ```json
    {
      "lesson": {
        "title": "Photosynthesis - Grade 7",
        "introduction": "Let's learn about Photosynthesis...",
        "explanation": "Photosynthesis is the process where plants...",
        "analogy": "For example, think of leaves as solar panels...",
        "recap": "To summarize, plants convert light to energy...",
        "quiz": "Question 1 (True/False): Plants need light. Answer: True...",
        "language": "English",
        "grade": 7,
        "timestamp": "2026-07-20T18:00:00.000Z"
      },
      "audio": {
        "audioBase64": "//uQxAAAAAAAAAAAAAAAAAAAAAA...",
        "voiceUsed": "Aditi",
        "languageCode": "en-IN",
        "isFallback": false,
        "cached": false
      },
      "cached": false,
      "stats": {
        "lessonApiCalls": 1,
        "lessonCacheHits": 0,
        "audioApiCalls": 1,
        "audioCacheHits": 0
      }
    }
    ```

### 3. Diagram Generation API
*   **Endpoint**: `POST /api/diagram`
*   **Description**: Generates base64-encoded visual diagrams using Pollinations.ai.
*   **Request Body**:
    ```json
    {
      "topic": "Water Cycle",
      "grade": 6,
      "language": "English",
      "style": "flow"
    }
    ```
*   **Response (200 OK)**:
    ```json
    {
      "imageBase64": "iVBORw0KGgoAAAANSUhEUgAA...",
      "style": "flow",
      "cached": false,
      "stats": {
        "apiCalls": 1,
        "cacheHits": 0,
        "savingsPercent": "0.0%"
      }
    }
    ```

### 4. Doubt Solving API
*   **Endpoint**: `POST /api/doubt`
*   **Description**: Processes a question contextually, generates a short 2-3 paragraph answer, and synthesizes audio.
*   **Request Body**:
    ```json
    {
      "question": "Why do leaves look green?",
      "topic": "Photosynthesis",
      "grade": 7,
      "language": "English"
    }
    ```
*   **Response (200 OK)**:
    ```json
    {
      "answer": "Leaves look green because they contain a pigment called chlorophyll. This pigment absorbing sunlight...",
      "audio": {
        "audioBase64": "//uQxAAAAAAAAAAAAAAAAAAAAAA...",
        "voiceUsed": "Aditi",
        "languageCode": "en-IN",
        "cached": false
      },
      "cached": false,
      "stats": {
        "doubtApiCalls": 1,
        "doubtCacheHits": 0,
        "doubtAudioApiCalls": 1,
        "doubtAudioCacheHits": 0
      }
    }
    ```

---

## ⚡ Caching Strategy & Cost Impact

The platform integrates standard `node-cache` instances inside each routing controller. This acts as a critical buffer, drastically reducing AWS fees and rendering latency.

### Cache Configuration Details

| Cache Name | Key Schema | TTL | Eviction Check | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **`lessonCache`** | `lesson_${topic}_${grade}_${lang}` | 7 Days (`604800s`) | 24 Hours | Caches structured lesson text & quizzes |
| **`audioCache`** (Lesson) | `audio_${topic}_${grade}_${lang}` | 1 Hour (`3600s`) | 10 Mins | Caches Polly MP3 audio of the full lesson |
| **`diagramCache`** | `img_${topic}_${grade}_${style}` | 7 Days (`604800s`) | 24 Hours | Caches generated base64 PNG diagrams |
| **`doubtCache`** | `doubt_${hash(question)}_${grade}_${lang}` | 1 Hour (`3600s`) | 10 Mins | Caches doubt text answers |
| **`doubtAudioCache`** | `doubt_audio_${hash(answer)}_${lang}` | 1 Hour (`3600s`) | 10 Mins | Caches doubt synthesized voice responses |
| **`audioCache`** (General) | `audio_${voiceId}_${langCode}_${hash(text)}` | 24 Hours (`86400s`) | 1 Hour | Caches arbitrary speech audio queries |

### Technical Rationale & Critical Discrepancies
1.  **Quota Protection**: Image Generation can have strict concurrent TPS and latency limitations. Caches diagrams for 7 days to ensure repeat requests for standard curriculum topics load instantly.
2.  **Mismatched TTLs**: There is a mismatch in `routes/lesson.js`. The `lessonCache` TTL is set to **7 days**, but its associated `audioCache` has a TTL of only **1 hour**. If a cached lesson is requested after 2 hours, it returns a lesson cache hit, but triggers a brand new AWS Polly synthesize command, resulting in latency and API cost.
3.  **RAM Volatility**: Using in-process `node-cache` memory means any server restart or deploy wipes the cache completely.

---

## ⚠️ Known Limitations & Security Gaps

*   **API Credentials Exposure**: Access keys (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `DEEPGRAM_API_KEY`) are stored in raw format within `.env`. This poses a major vulnerability if files are accidentally checked into version control.
*   **Regional TTS Accents**: AWS Polly only natively supports English (`en-IN`) and Hindi (`hi-IN`). Other regional languages (e.g. Marathi, Tamil, Telugu) are routed to fallback on the Hindi voice model (`Aditi` with `hi-IN` code). This results in a heavy Hindi accent or inaccurate phonetics when trying to speak south Indian or regional dialects.
*   **Missing Rate Limiting**: The backend has no IP rate limits. A single user can repeatedly call image generation and speech synthesis, quickly depleting the monthly AWS quota and driving up costs.
*   **Sequential Frontend Promises**: Diagram requests do not launch until the lesson generator responds, delaying the screen visual update.
*   **No Input Sanitization**: User topics and doubts are interpolated directly into prompts, exposing the system to prompt injection.
*   **Unused AWS Transcribe Code**: `awsClients.js` imports and instantiates the `TranscribeStreamingClient`, but this client is completely unused in the active route handlers (which rely on Deepgram).

---

## 📅 Future Roadmap

- [ ] **Parallel Request Execution**: Refactor the frontend `handleGenerate` flow to trigger lesson and diagram endpoints concurrently via `Promise.all` to halve load times.
- [ ] **Distributed Cache**: Migrate `node-cache` to a shared Redis store to maintain cache states across container restarts or horizontal scaling.
- [ ] **TTL Harmonization**: Sync lesson text and lesson audio cache expirations to avoid re-generating audio for cached lessons.
- [ ] **Rate Limiting & Shielding**: Add `express-rate-limit` to restrict API requests per IP. Add input validation rules and prompt filtering to block injection attempts.
- [ ] **Regional TTS Integration**: Replace AWS Polly for regional languages with specialized TTS models (e.g., Azure Speech SDK or Bhashini APIs) to read Kannada, Telugu, Tamil, and Bengali accurately.

---

## 🖼️ Screenshots & Demo Placeholders

### Substitute Teacher Smartboard Dashboard
![Dashboard Placeholder](https://raw.githubusercontent.com/antigravity-ide/placeholders/main/vidyavani_dashboard_mockup.png)
*Figure 1: Main smartboard user interface displaying lesson paragraphs, autoplays, and the interactive doubt solver panel.*

### Cost Analytics Panel
![Performance Analytics Placeholder](https://raw.githubusercontent.com/antigravity-ide/placeholders/main/vidyavani_stats_mockup.png)
*Figure 2: System performance screen demonstrating API cost savings and cached content hit rate.*
