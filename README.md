# 🎓 VidyaVani: Voice-First AI Substitute Teacher for Government Schools

> **Pitch**: Transforming idle smartboards in resource-constrained classrooms into autonomous, multilingual, voice-first learning assistants that generate NCERT-grounded lessons, diagrams, and answer student doubts in real-time.

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
*   **Speech-to-Text Input**: Powered by Deepgram Nova-3 STT, teachers or class monitors can trigger lesson generation using voice commands in 9 Indian languages (English, Hindi, Marathi, Tamil, Telugu, Bengali, Gujarati, Kannada, Malayalam).
*   **Pedagogical Lesson Structure**: Generates lessons structured into four clear sections (Introduction, Detailed Explanation, Daily-life Analogy, and Quick Recap) tailored to student grade levels (1–12).
*   **Interactive Practice Quiz**: Automatically appends 3 graded questions (Easy True/False, Medium MCQ with options, and Hard Application) rendered as interactive, reveal-on-click question cards.

### 2. RAG-Grounded NCERT Curriculum Content
*   **NCERT Retrieval Pipeline**: Before generating a lesson, the system queries an external Python AWS Lambda microservice that performs vector similarity search against ingested NCERT textbook chunks using `gemini-1.5-flash` embeddings and `pgvector` on Neon PostgreSQL.
*   **Source Citations in UI**: Grounded lessons feature a "✨ Grounded in NCERT Curriculum" badge and render chapter and page citation tags (e.g., `📖 NCERT · Life Processes · Page 12`).
*   **Graceful Fallback**: If vector retrieval returns 0 chunks above the relevance threshold (`similarity >= 0.6`) or times out, the backend gracefully falls back to ungrounded Gemini lesson generation without failing the request.

### 3. Two-Stage Prompt-Chained Visual Diagram Generator
*   **Visual Relevance Analyzer**: Checks if the requested topic benefits from a visual diagram (covering Biology, Chemistry, Physics, Earth & Space Science, Geometry, etc.).
*   **Two-Stage Prompt Chaining**: Solves the bug where generic prompts produced visually repetitive diagrams. Stage 1 calls Gemini to produce a concrete, 2–3 sentence spatial and content specification of the diagram. Stage 2 passes this detailed description to Pollinations.ai to render clean vector-style, flowchart, iconic, or scientific visual aids.

### 4. Native Regional Voice Narration & Interactive Doubt Solver
*   **Google Cloud TTS Integration**: Migrated from AWS Polly to fix regional-language accent fallback issues. Utilizes native Wavenet Indian voice models (`en-IN`, `hi-IN`, `mr-IN`, `ta-IN`, `te-IN`, `bn-IN`, `gu-IN`, `kn-IN`, `ml-IN`) for clear, natural classroom audio narration.
*   **Classroom Doubt Solving**: Students can click the microphone button, ask doubts (e.g., *"How do stomata open and close?"*), and receive an instant spoken answer with synchronized audio narration.

### 5. Durable Redis Caching Layer
*   **Persistent Caching**: Replaced in-memory `node-cache` with a shared `ioredis` client connecting to Upstash Redis.
*   **Server Restart Survival**: Verified to persist lesson text, audio, diagrams, and doubt answers across server restarts and redeployments.
*   **Graceful Degradation**: If Redis is unreachable, the system logs a warning and degrades gracefully to real-time generation.

---

## 🗺️ System Architecture

```
                                  ┌─────────────────────────────────────────┐
                                  │           React Frontend App            │
                                  │      (Vite + WebRTC MediaRecorder)      │
                                  └────────────────────┬────────────────────┘
                                                       │
                                                       ▼ POST /api/transcribe, /api/lesson, /api/doubt, /api/diagram
                                  ┌─────────────────────────────────────────┐
                                  │         Node.js / Express Backend       │
                                  └───────┬─────────────┬─────────────┬─────┘
                                          │             │             │
                    ┌─────────────────────┘             │             └─────────────────────┐
                    ▼                                   ▼                                   ▼
        ┌───────────────────────┐           ┌───────────────────────┐           ┌───────────────────────┐
        │   Deepgram STT API    │           │  Upstash Redis Cache  │           │   Google Cloud TTS    │
        │     (Nova-3 Model)    │           │       (ioredis)       │           │   (Wavenet Voices)    │
        └───────────────────────┘           └───────────────────────┘           └───────────────────────┘
                                                        │
                                                        ▼ (RAG Retrieval Request)
                                            ┌───────────────────────┐
                                            │ AWS API Gateway / HTTP│
                                            └───────────┬───────────┘
                                                        │
                                                        ▼
                                            ┌───────────────────────┐
                                            │  Python Lambda (RAG)  │
                                            │   (pg8000 + pgvector) │
                                            └───────────┬───────────┘
                                                        │
                                    ┌───────────────────┴───────────────────┐
                                    ▼                                       ▼
                        ┌───────────────────────┐               ┌───────────────────────┐
                        │   Neon PostgreSQL     │               │   Google Gemini API   │
                        │ (pgvector Embeddings) │               │  (Lesson & Diagram)   │
                        └───────────────────────┘               └───────────────────────┘
                                                                            │
                                                                            ▼
                                                                ┌───────────────────────┐
                                                                │    Pollinations.ai    │
                                                                │  (Diagram Rendering)  │
                                                                └───────────────────────┘
```

---

## 💻 Tech Stack

| Layer | Technologies | Details |
| :--- | :--- | :--- |
| **Frontend** | React, Vite, HTML5 WebRTC (MediaRecorder API) | Dynamic UI, browser audio recording, voice input, interactive quiz cards |
| **Backend** | Node.js, Express, Rate Limiter | REST API endpoints, input sanitization, rate limiting, error boundaries |
| **Microservices / RAG** | Python 3.13, AWS Lambda, API Gateway, pg8000, pdfplumber | Serverless vector retrieval endpoint, pure-Python PostgreSQL layer |
| **Database & Caching** | Neon PostgreSQL (`pgvector`), Upstash Redis (`ioredis`) | Vector storage for NCERT chunks, durable multi-tier TTL caching |
| **AI / ML Services** | Google Gemini (`gemini-3.1-flash-lite`), Pollinations.ai, Google Cloud TTS, Deepgram (`nova-3`) | Lesson generation, prompt-chained diagrams, regional voice synthesis, speech-to-text |

---

## 🛠️ Engineering Decisions

During development, several non-obvious architecture and tooling choices were made to optimize cost, reliability, and maintainability:

1. **Python AWS Lambda for RAG vs. Node.js Integration**:
   - *Rationale*: Python possesses a far more mature data science and RAG ecosystem (`pdfplumber`, `numpy`, `pgvector` bindings). Decoupling retrieval into a serverless Python Lambda behind API Gateway creates a clean polyglot architecture where Node.js handles web routing and Python handles vector search.

2. **`pg8000` Driver vs. `psycopg2`**:
   - *Rationale*: `psycopg2` requires compiled C-extensions (`libpq.so`), which complicate AWS Lambda layer builds. `pg8000` is a pure-Python PostgreSQL driver that installs seamlessly into serverless Lambda layers without native binary compilation.

3. **Manual CLI Ingestion vs. Live Upload UI**:
   - *Rationale*: Textbook ingestion is an infrequent operation performed when new curricula are adopted. Building an in-app PDF upload feature would add unnecessary operational surface area and security risk. Ingestion remains a clean, standalone Python script (`rag/ingest.py`).

4. **Migration from AWS Bedrock & AWS Polly to Gemini & Google Cloud TTS**:
   - *Rationale*: AWS Polly lacked native voice models for several regional Indian languages, falling back to English-accented voices. Google Cloud TTS provides authentic Indian Wavenet voices (`hi-IN`, `ta-IN`, `te-IN`, `mr-IN`, etc.). Furthermore, switching to Google Gemini provided superior cost sustainability on developer free tiers.

---

## 📖 API Documentation

### 1. Transcription API
*   **Endpoint**: `POST /api/transcribe`
*   **Description**: Converts base64-encoded WebM/MP4 recorded audio into text using Deepgram Nova-3.
*   **Request Body**: `{ "audioData": "GkXfo6NChoEB...", "language": "Hindi" }`
*   **Response (200 OK)**: `{ "success": true, "transcription": "प्रकाश संश्लेषण क्या है" }`

### 2. Lesson Generation API (RAG Grounded)
*   **Endpoint**: `POST /api/lesson`
*   **Description**: Queries RAG retrieval, constructs a grounded prompt, calls Gemini, and synthesizes audio.
*   **Request Body**: `{ "topic": "Photosynthesis", "grade": 10, "language": "English" }`
*   **Response (200 OK)**:
    ```json
    {
      "lesson": {
        "title": "Photosynthesis - Grade 10",
        "introduction": "Let's learn about photosynthesis...",
        "explanation": "Photosynthesis is the process...",
        "analogy": "For example...",
        "recap": "To summarize...",
        "quiz": "Question 1 (True/False)...",
        "sources": [
          { "chapter": "Life Processes", "page": 3 },
          { "chapter": "Life Processes", "page": 5 }
        ],
        "language": "English",
        "grade": 10
      },
      "audio": { "audioBase64": "...", "voiceUsed": "en-IN-Wavenet-A" },
      "cached": false
    }
    ```

### 3. Diagram Generation API
*   **Endpoint**: `POST /api/diagram`
*   **Description**: Prompt-chains Gemini to write a visual spec, then fetches a diagram from Pollinations.ai.
*   **Request Body**: `{ "topic": "Water Cycle", "grade": 6, "language": "English", "style": "flow" }`
*   **Response (200 OK)**: `{ "imageBase64": "iVBORw0...", "style": "flow", "cached": false }`

### 4. Doubt Solving API
*   **Endpoint**: `POST /api/doubt`
*   **Description**: Answers a student question in 2–3 paragraphs and synthesizes audio narration.
*   **Request Body**: `{ "question": "Why are leaves green?", "topic": "Photosynthesis", "grade": 10, "language": "English" }`
*   **Response (200 OK)**: `{ "answer": "Leaves look green because...", "audio": { "audioBase64": "..." }, "cached": false }`

---

## 🔍 Retrieval-Augmented Generation (RAG) Architecture & Setup

VidyaVani utilizes a high-precision, low-cost RAG pipeline to ground lesson plans and visual aids directly in the official NCERT curriculum textbooks. 

### 1. Database Schema Setup
We use Neon PostgreSQL with the `pgvector` extension enabled. To initialize the database, execute the [setup_db.sql](file:///d:/VidyaVani/VidyaVani/VidyaVani-backend/rag/setup_db.sql) script:
```sql
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Create curriculum_chunks table
CREATE TABLE IF NOT EXISTS curriculum_chunks (
    id SERIAL PRIMARY KEY,
    subject TEXT NOT NULL,
    chapter TEXT NOT NULL,
    grade INTEGER NOT NULL,
    board TEXT NOT NULL DEFAULT 'NCERT',
    chunk_text TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    embedding VECTOR(768) NOT NULL
);

-- Index for fast similarity searches
CREATE INDEX IF NOT EXISTS curriculum_chunks_embedding_idx 
ON curriculum_chunks USING ivfflat (embedding vector_cosine_ops);
```

### 2. Textbook Ingestion Pipeline
Textbooks (such as PDF files) are processed, cleaned, and embedded using [ingest.py](file:///d:/VidyaVani/VidyaVani/VidyaVani-backend/rag/ingest.py).
* **Text Extraction**: Uses `pdfplumber` to extract text page-by-page.
* **Cleaning Heuristics**:
  - Automatically identifies and reverses mirrored/reversed lines.
  - Collapses character repetitions.
  - Strips out unrelated callout boxes (like *"Do You Know?"* or *"More to Know!"*) using heuristic filters.
* **Embedding**: Embeds curriculum chunks using the Google Gemini Embedding API (`models/gemini-embedding-001`) to generate 768-dimension vectors.
* **To run ingestion**:
  1. Create a virtual environment and install the requirements:
     ```bash
     cd VidyaVani-backend/rag
     python -m venv venv
     # Activate venv:
     # Windows: .\venv\Scripts\activate
     # Mac/Linux: source venv/bin/activate
     pip install -r requirements.txt
     ```
  2. Put your NCERT textbook PDF in the `rag/` folder (e.g., `jesc105.pdf` for Grade 10 Science).
  3. Execute `ingest.py`:
     ```bash
     python ingest.py jesc105.pdf --subject Science --chapter "Life Processes" --grade 10
     ```

### 3. Serverless Retrieval Microservice
The vector search is decoupled into a standalone Python AWS Lambda function, located at [retrieval_lambda.py](file:///d:/VidyaVani/VidyaVani/VidyaVani-backend/rag/retrieval_lambda.py):
* **No Heavy Dependencies**: Uses `pg8000` (a pure-Python PostgreSQL driver) to avoid compilation issues in serverless runtimes.
* **Query Flow**:
  1. Receives an HTTP POST payload containing:
     ```json
     {
       "query": "How do plants perform photosynthesis?",
       "grade": 10,
       "subject": "Science",
       "top_k": 3
     }
     ```
  2. Embeds the user query using `models/gemini-embedding-001`.
  3. Computes the cosine similarity: `SELECT ... ORDER BY (embedding <=> :vec) ASC LIMIT :top_k`.
  4. Returns the top matched curriculum text chunks, page numbers, and similarity metrics.

### 4. Verifying Retrieval Locally
Before deploying, you can test the database search directly using the [test_retrieval.py](file:///d:/VidyaVani/VidyaVani/VidyaVani-backend/rag/test_retrieval.py) script:
```bash
python test_retrieval.py "How does the human heart pump blood?"
```

---


## 🛠️ Setup & Environment Configuration

### 📋 Prerequisites
*   Node.js (v18.x or above)
*   Python 3.10+ (for RAG ingestion / Lambda script)
*   Google Gemini API Key
*   Google Cloud Service Account / API Key with Text-to-Speech API enabled
*   Deepgram API Key
*   Upstash Redis instance URL
*   Neon PostgreSQL database instance (with `pgvector` extension enabled)

### 🔑 Environment Variables Configuration

Create a `.env` file inside `VidyaVani-backend/`:

```env
PORT=5001

# Google Gemini API Key
GEMINI_API_KEY=your_gemini_api_key_here

# Deepgram Speech-to-Text Key
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# Google Cloud Text-to-Speech Credentials
GOOGLE_APPLICATION_CREDENTIALS=D:/path/to/google_app_cred.json
GOOGLE_TTS_API_KEY=your_google_tts_api_key_here

# Upstash Redis Connection String
REDIS_URL=rediss://default:your_password@your-redis-instance.upstash.io:6379

# Neon PostgreSQL Database Connection (RAG)
DATABASE_URL=postgresql://user:password@ep-cool-db.us-east-1.aws.neon.tech/neondb?sslmode=require
```

### ⚙️ Running Locally

#### 1. Start Backend:
```bash
cd VidyaVani-backend
npm install
node app.js
```

#### 2. Start Frontend:
```bash
cd vidyavani-frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## ⚠️ Known Limitations

*   **Deployment Status**: Currently configured for local development and Docker containers (cloud deployment scripts in progress).
*   **RAG Curriculum Coverage**: Ingested content is currently focused on specific NCERT Science chapters (e.g., Grade 10 Science - *Life Processes*). Expanding coverage requires running `rag/ingest.py` for additional PDF textbooks.
*   **Pollinations.ai Dependency**: Diagram generation relies on public Pollinations.ai endpoints, which can occasionally experience transient network latency.
