# VidyaVani 🎓 — Voice-First AI Substitute Teacher

VidyaVani converts smartboards into AI-powered teaching assistants to address India’s 11+ lakh teacher shortage. It teaches lessons, generates diagrams, answers doubts, and narrates content in 9 Indian languages using a fully voice-first interface.


---

## ⭐ Why VidyaVani?

- Severe shortage of teachers in government schools  
- Rural classes often remain unattended  
- Smartboards exist but remain underutilized  
- Students need local-language, interactive explanations  

**VidyaVani ensures learning continues even without a teacher.**

---

## 🚀 Features

- 🎤 Voice-first topic selection  
- 📚 AI-generated lessons (intro, explanation, examples, recap)  
- 🎨 Auto diagrams (multiple styles)  
- 🔊 Natural narration (AWS Polly)  
- ❓ Voice-based doubt solving  
- 📝 Quiz generation (easy, medium, hard)  
- 💾 Smart caching (60–80% API savings)

**Supported Languages:** English, Hindi, Marathi, Tamil, Telugu, Kannada, Bengali, Gujarati, Malayalam

---

## 🏗️ System Architecture
Student → Voice Input
→ Deepgram STT
→ AWS Bedrock (LLM: lessons, quizzes, doubts)
→ Bedrock Image Gen (diagrams)
→ AWS Polly (TTS)
→ Smartboard Output (text + images + audio)  


---

## 🛠️ Tech Stack

**Backend:** Node.js, Express, AWS Bedrock, AWS Polly, Deepgram, Node-Cache  
**Frontend:** React, Tailwind  
**Infra:** AWS SDK, CORS, dotenv

---

## 💾 Caching Strategy

| Resource | TTL |
|---------|------|
| Lessons | 7 days |
| Diagrams | 7 days |
| Audio | 24 hours |
| Doubts | 1 hour |

---

## 🌍 Impact

- Continuous learning in teacher-absent situations  
- Local-language explanations improve clarity  
- Works with existing smartboards (no hardware cost)  
- Scalable across districts & states  

---

## 🔮 Future Roadmap

- Adaptive learning  
- Multi-turn conversational AI  
- Offline mode for low-connectivity schools  
- Teacher dashboard  
- Student progress tracking  

---




