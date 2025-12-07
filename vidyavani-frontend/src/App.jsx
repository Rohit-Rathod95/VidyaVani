import { useState } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [topic, setTopic] = useState("Photosynthesis");
  const [grade, setGrade] = useState(7);
  const [language, setLanguage] = useState("English");

  const [lesson, setLesson] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const API_BASE = "http://localhost:5000";

  const handleGenerate = async () => {
    setError("");
    setLesson(null);
    setImageBase64(null);
    setLoading(true);

    try {
      // 1) Fetch lesson
      const lessonRes = await axios.post(`${API_BASE}/api/lesson`, {
        topic,
        grade,
        language,
      });
      setLesson(lessonRes.data.lesson);

      // 2) Fetch diagram
      const diagramRes = await axios.post(`${API_BASE}/api/diagram`, {
        topic,
      });
      setImageBase64(diagramRes.data.imageBase64);

    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>VidyaVani – Day 1 Prototype</h1>
        <p className="subtitle">
          AI Lesson + Diagram Generator (AWS Bedrock + React)
        </p>
      </header>

      <main className="main">
        <section className="card controls">
          <h2>Generate Lesson</h2>

          <div className="form-row">
            <label>Topic</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Photosynthesis"
            />
          </div>

          <div className="form-row">
            <label>Grade</label>
            <input
              type="number"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              min={1}
              max={12}
            />
          </div>

          <div className="form-row">
            <label>Language</label>
            <input
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            />
          </div>

          <button onClick={handleGenerate} disabled={loading || !topic.trim()}>
            {loading ? "Generating..." : "Generate"}
          </button>

          {error && <p className="error">⚠ {error}</p>}
        </section>

        <section className="output-grid">
          {/* Lesson Display */}
          <div className="card lesson-card">
            <h2>Lesson Preview</h2>

            {!lesson && !loading && (
              <p className="placeholder">Lesson will appear here...</p>
            )}

            {lesson && (
              <div className="lesson-content">
                <h3>{lesson.title}</h3>

                <div className="lesson-block">
                  <h4>Introduction</h4>
                  <p>{lesson.introduction}</p>
                </div>

                <div className="lesson-block">
                  <h4>Explanation</h4>
                  <p>{lesson.explanation}</p>
                </div>

                <div className="lesson-block">
                  <h4>Analogy</h4>
                  <p>{lesson.analogy}</p>
                </div>

                <div className="lesson-block">
                  <h4>Recap</h4>
                  <p>{lesson.recap}</p>
                </div>
              </div>
            )}
          </div>

          {/* Diagram Display */}
          <div className="card diagram-card">
            <h2>Diagram Preview</h2>

            {!imageBase64 && !loading && (
              <p className="placeholder">Diagram will appear here...</p>
            )}

            {imageBase64 && (
              <img
                src={`data:image/png;base64,${imageBase64}`}
                alt="diagram"
                className="diagram-image"
              />
            )}
          </div>
        </section>
      </main>

      <footer className="footer">
        <p>VidyaVani · Built on AWS Bedrock · Day 1</p>
      </footer>
    </div>
  );
}

export default App;
