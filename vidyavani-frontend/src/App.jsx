// App.jsx - FIXED AUDIO PLAYBACK
import { useState, useRef, useEffect } from "react";
import VoiceInput from "./VoiceInput";
import "./App.css";

function App() {
  const [topic, setTopic] = useState("");
  const [grade, setGrade] = useState(7);
  const [language, setLanguage] = useState("English");
  const [diagramStyle, setDiagramStyle] = useState("iconic");

  const [lesson, setLesson] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [availableStyles, setAvailableStyles] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lessonLoading, setLessonLoading] = useState(false);
  const [diagramLoading, setDiagramLoading] = useState(false);
  const [lessonError, setLessonError] = useState("");
  const [diagramError, setDiagramError] = useState("");

  const [doubtText, setDoubtText] = useState("");
  const [doubtAnswer, setDoubtAnswer] = useState(null);
  const [doubtLoading, setDoubtLoading] = useState(false);
  const [showDoubtSection, setShowDoubtSection] = useState(false);

  const [lessonAudioSrc, setLessonAudioSrc] = useState(null);
  const [doubtAudioSrc, setDoubtAudioSrc] = useState(null);
  const [isPlayingLessonAudio, setIsPlayingLessonAudio] = useState(false);
  const [isPlayingDoubtAudio, setIsPlayingDoubtAudio] = useState(false);
  const [audioError, setAudioError] = useState("");

  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState(null);

  const lessonAudioRef = useRef(null);
  const doubtAudioRef = useRef(null);

  const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5001";

  useEffect(() => {
    fetchStyles();
    fetchStats();
  }, []);

  // Effect to handle lesson audio when it's set
  useEffect(() => {
    if (lessonAudioSrc && lessonAudioRef.current) {
      console.log("🎵 Lesson audio source updated, preparing to play...");

      const audio = lessonAudioRef.current;
      let hasPlayed = false;

      const handleCanPlay = () => {
        if (!hasPlayed) {
          hasPlayed = true;
          console.log("✅ Audio can play, attempting autoplay...");

          // Small delay to ensure everything is ready
          setTimeout(() => {
            if (audio.paused) {
              playLessonAudio();
            }
          }, 100);
        }
      };

      const handleLoadedMetadata = () => {
        console.log("📊 Audio metadata loaded, duration:", audio.duration);
      };

      // Remove old listeners first
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);

      audio.addEventListener('canplay', handleCanPlay, { once: true });
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);

      // Force load
      audio.load();

      return () => {
        audio.removeEventListener('canplay', handleCanPlay);
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
    }
  }, [lessonAudioSrc]);

  // Effect to handle doubt audio when it's set
  useEffect(() => {
    if (doubtAudioSrc && doubtAudioRef.current) {
      console.log("🎵 Doubt audio source updated, preparing to play...");

      const audio = doubtAudioRef.current;
      let hasPlayed = false;

      const handleCanPlay = () => {
        if (!hasPlayed) {
          hasPlayed = true;
          console.log("✅ Doubt audio can play, attempting autoplay...");

          setTimeout(() => {
            if (audio.paused) {
              playDoubtAudio();
            }
          }, 100);
        }
      };

      audio.removeEventListener('canplay', handleCanPlay);
      audio.addEventListener('canplay', handleCanPlay, { once: true });
      audio.load();

      return () => {
        audio.removeEventListener('canplay', handleCanPlay);
      };
    }
  }, [doubtAudioSrc]);

  const fetchStyles = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/diagram/styles`);
      const data = await res.json();
      if (data.styles && Array.isArray(data.styles)) {
        setAvailableStyles(data.styles);
      }
    } catch (err) {
      console.error("Error fetching styles:", err);
      setAvailableStyles([
        { value: "iconic", label: "Icon-Based" },
        { value: "abstract", label: "Abstract" },
        { value: "flow", label: "Flowchart" },
        { value: "illustration", label: "Illustration" }
      ]);
    }
  };

  const fetchStats = async () => {
    try {
      const [lessonStats, audioStats, doubtStats] = await Promise.all([
        fetch(`${API_BASE}/api/lesson/stats`).then(r => r.json()),
        fetch(`${API_BASE}/api/audio/stats`).then(r => r.json()),
        fetch(`${API_BASE}/api/doubt/stats`).then(r => r.json())
      ]);

      setStats({
        lessons: lessonStats,
        audio: audioStats,
        doubts: doubtStats
      });
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  };

  const handleTopicVoiceTranscription = (transcription) => {
    setTopic(transcription);
    console.log("📝 Topic transcribed:", transcription);
    if (transcription.trim()) {
      setTimeout(() => handleGenerate(), 500);
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError("Please enter a topic");
      return;
    }

    setError("");
    setLessonError("");
    setDiagramError("");
    setAudioError("");
    setLesson(null);
    setImageBase64(null);
    setDoubtAnswer(null);
    setDoubtText("");
    setLessonAudioSrc(null);
    setDoubtAudioSrc(null);
    setShowDoubtSection(false);

    stopAllAudio();

    const lessonPromise = (async () => {
      setLessonLoading(true);
      try {
        console.log("📚 Generating lesson with auto-audio...");
        const lessonRes = await fetch(`${API_BASE}/api/lesson`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: topic.trim(),
            grade,
            language,
          })
        });

        const lessonData = await lessonRes.json();

        if (!lessonRes.ok) {
          throw new Error(lessonData.error || lessonData.errors?.join(', ') || "Failed to generate lesson");
        }

        const { lesson: generatedLesson, audio: autoAudio, cached } = lessonData;

        console.log("Response data:", {
          hasLesson: !!generatedLesson,
          hasAudio: !!autoAudio,
          audioBase64Length: autoAudio?.audioBase64?.length
        });

        setLesson(generatedLesson);
        console.log(`✅ Lesson ${cached ? '(cached)' : 'generated'}`);

        if (autoAudio?.audioBase64) {
          console.log("🎵 Setting lesson audio source...");
          const audioSrc = `data:audio/mp3;base64,${autoAudio.audioBase64}`;
          setLessonAudioSrc(audioSrc);
        } else {
          console.warn("⚠️ No audio available in response");
          setAudioError("Audio not available for this lesson");
        }
      } catch (err) {
        console.error("Lesson generation error:", err);
        setLessonError(err.message || "Something went wrong.");
      } finally {
        setLessonLoading(false);
      }
    })();

    const diagramPromise = (async () => {
      setDiagramLoading(true);
      try {
        console.log("🎨 Generating diagram...");
        const diagramRes = await fetch(`${API_BASE}/api/diagram`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: topic.trim(),
            grade,
            language,
            style: diagramStyle
          })
        });

        const diagramData = await diagramRes.json();
        if (!diagramRes.ok) {
          throw new Error(diagramData.error || "Failed to generate diagram");
        }

        if (diagramData.imageBase64) {
          setImageBase64(diagramData.imageBase64);
          console.log("✅ Diagram generated");
        }
      } catch (err) {
        console.error("Diagram generation error:", err);
        setDiagramError(err.message || "Something went wrong.");
      } finally {
        setDiagramLoading(false);
      }
    })();

    try {
      await Promise.all([lessonPromise, diagramPromise]);
      setShowDoubtSection(true);
      fetchStats();
    } catch (err) {
      console.error("Parallel execution completed with errors:", err);
    }
  };

  const handleDoubtVoiceTranscription = (transcription) => {
    setDoubtText(transcription);
    console.log("❓ Doubt transcribed:", transcription);
    if (transcription.trim()) {
      setTimeout(() => handleSubmitDoubt(transcription), 500);
    }
  };

  const handleSubmitDoubt = async (voiceDoubt = null) => {
    const question = voiceDoubt || doubtText;

    if (!question.trim()) {
      setError("Please enter a question");
      return;
    }

    if (question.length > 500) {
      setError("Question too long (max 500 characters)");
      return;
    }

    setDoubtLoading(true);
    setError("");
    setAudioError("");
    setDoubtAnswer(null);
    setDoubtAudioSrc(null);
    stopAllAudio();

    try {
      console.log("❓ Submitting doubt...");

      const doubtRes = await fetch(`${API_BASE}/api/doubt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          topic: lesson?.title || topic,
          grade,
          language
        })
      });

      const { answer, audio: doubtAudio, cached } = await doubtRes.json();

      console.log("Doubt response:", {
        hasAnswer: !!answer,
        hasAudio: !!doubtAudio,
        audioBase64Length: doubtAudio?.audioBase64?.length
      });

      setDoubtAnswer(answer);
      console.log(`✅ Doubt ${cached ? '(cached)' : 'answered'}`);

      if (doubtAudio?.audioBase64) {
        console.log("🎵 Setting doubt audio source...");
        const audioSrc = `data:audio/mp3;base64,${doubtAudio.audioBase64}`;
        setDoubtAudioSrc(audioSrc);
        // Audio will auto-play via useEffect
      } else {
        console.warn("⚠️ No audio available for answer");
        setAudioError("Audio not available for this answer");
      }

      if (!voiceDoubt) {
        setDoubtText("");
      }

      fetchStats();

    } catch (err) {
      console.error("Doubt error:", err);
      const errorMsg = err.message || "Failed to answer";
      setError(`❌ ${errorMsg}`);
    } finally {
      setDoubtLoading(false);
    }
  };

  const playLessonAudio = () => {
    if (lessonAudioRef.current && !isPlayingLessonAudio) {
      const audio = lessonAudioRef.current;
      console.log("▶️ Attempting to play lesson audio...");
      console.log("Audio ready state:", audio.readyState);
      console.log("Audio paused:", audio.paused);

      // Only reset if not already playing
      if (audio.paused) {
        audio.currentTime = 0;

        const playPromise = audio.play();

        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("✅ Lesson audio playing successfully");
              setIsPlayingLessonAudio(true);
              setAudioError("");
            })
            .catch(err => {
              console.error("❌ Audio play error:", err);

              if (err.name === 'NotAllowedError') {
                setAudioError("🔊 Browser blocked autoplay. Please click the Play button to start audio.");
              } else if (err.name === 'NotSupportedError') {
                setAudioError("🔊 Audio format not supported by your browser.");
              } else if (err.name === 'AbortError') {
                console.log("Play was interrupted, this is normal");
              } else {
                setAudioError(`🔊 Audio playback failed: ${err.message}. Click Play button to try again.`);
              }
            });
        }
      }
    }
  };

  const playDoubtAudio = () => {
    if (doubtAudioRef.current && !isPlayingDoubtAudio) {
      const audio = doubtAudioRef.current;
      console.log("▶️ Attempting to play doubt audio...");

      if (audio.paused) {
        audio.currentTime = 0;

        const playPromise = audio.play();

        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("✅ Doubt audio playing successfully");
              setIsPlayingDoubtAudio(true);
              setAudioError("");
            })
            .catch(err => {
              console.error("❌ Doubt audio play error:", err);

              if (err.name === 'NotAllowedError') {
                setAudioError("🔊 Browser blocked autoplay. Please click the Play button.");
              } else if (err.name === 'AbortError') {
                console.log("Play was interrupted, this is normal");
              } else {
                setAudioError(`🔊 Audio playback failed: ${err.message}`);
              }
            });
        }
      }
    }
  };

  const stopAllAudio = () => {
    if (lessonAudioRef.current) {
      lessonAudioRef.current.pause();
      lessonAudioRef.current.currentTime = 0;
      setIsPlayingLessonAudio(false);
    }
    if (doubtAudioRef.current) {
      doubtAudioRef.current.pause();
      doubtAudioRef.current.currentTime = 0;
      setIsPlayingDoubtAudio(false);
    }
  };

  const toggleLessonAudio = () => {
    if (lessonAudioRef.current) {
      if (isPlayingLessonAudio) {
        lessonAudioRef.current.pause();
        setIsPlayingLessonAudio(false);
      } else {
        playLessonAudio();
      }
    }
  };

  const toggleDoubtAudio = () => {
    if (doubtAudioRef.current) {
      if (isPlayingDoubtAudio) {
        doubtAudioRef.current.pause();
        setIsPlayingDoubtAudio(false);
      } else {
        playDoubtAudio();
      }
    }
  };

  return (
    <div className="app">
      {/* Header Section */}
      <header className="app-header">
        <div className="brand-container">
          <h1 className="brand-title">🎓 VidyaVani</h1>
          <p className="brand-subtitle">
            Voice-First AI Substitute Teacher for Government Schools
          </p>
          <p className="brand-tagline">
            Transforming idle smartboards into autonomous learning assistants
          </p>
          <button
            onClick={() => setShowStats(!showStats)}
            className="stats-toggle-btn"
          >
            {showStats ? "Hide Performance Stats" : "Show Performance Stats"}
          </button>
        </div>
      </header>

      {/* Stats Panel */}
      {showStats && stats && (
        <div className="stats-panel">
          <h3 className="stats-title">📊 System Performance & Cost Savings</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <h4>Lessons Generated</h4>
              <div className="stat-number">{stats.lessons.totalRequests || 0}</div>
              <div className="stat-detail">
                API Calls: {stats.lessons.apiCalls || 0} | Cache Hits: {stats.lessons.cacheHits || 0}
              </div>
              <div className="stat-savings">
                {stats.lessons.cacheHitRate || '0%'} Cost Saved
              </div>
            </div>

            <div className="stat-card">
              <h4>Audio Generated</h4>
              <div className="stat-number">{stats.audio.totalRequests || 0}</div>
              <div className="stat-detail">
                API Calls: {stats.audio.apiCalls || 0} | Cache Hits: {stats.audio.cacheHits || 0}
              </div>
              <div className="stat-savings">
                {stats.audio.cacheHitRate || '0%'} Cost Saved
              </div>
            </div>

            <div className="stat-card">
              <h4>Doubts Answered</h4>
              <div className="stat-number">{stats.doubts.doubts?.totalQuestions || 0}</div>
              <div className="stat-detail">
                API Calls: {stats.doubts.doubts?.apiCalls || 0} | Cache Hits: {stats.doubts.doubts?.cacheHits || 0}
              </div>
              <div className="stat-savings">
                {stats.doubts.doubts?.cacheHitRate || '0%'} Cost Saved
              </div>
            </div>
          </div>
          <div className="stats-message">
            💡 Smart caching reduces AWS API costs and improves response time significantly!
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <main className="main-grid">
        {/* Left Panel - Controls & Lesson */}
        <div className="left-panel">
          {/* Controls Card */}
          <section className="card controls-card">
            <h2 className="card-title">🎯 Create Your Lesson</h2>

            {/* Topic Input */}
            <div className="form-group">
              <label className="form-label">Topic</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., Photosynthesis, Newton's Laws, Fractions"
                className="form-input"
                maxLength={200}
              />
              <div className="voice-input-wrapper">
                <VoiceInput
                  onTranscription={handleTopicVoiceTranscription}
                  language={language}
                  apiBase={API_BASE}
                  buttonText="🎤 Speak Topic"
                />
              </div>
              <p className="helper-text">
                💡 Tap the mic and speak naturally in your language
              </p>
            </div>

            {/* Grade & Language */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Grade</label>
                <input
                  type="number"
                  value={grade}
                  onChange={(e) => setGrade(Number(e.target.value))}
                  min={1}
                  max={12}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="form-select"
                >
                  <option value="English">English</option>
                  <option value="Hindi">हिंदी (Hindi)</option>
                  <option value="Marathi">मराठी (Marathi)</option>
                  <option value="Tamil">தமிழ் (Tamil)</option>
                  <option value="Telugu">తెలుగు (Telugu)</option>
                  <option value="Bengali">বাংলা (Bengali)</option>
                  <option value="Gujarati">ગુજરાતી (Gujarati)</option>
                  <option value="Kannada">ಕನ್ನಡ (Kannada)</option>
                  <option value="Malayalam">മലയാളം (Malayalam)</option>
                </select>
              </div>
            </div>

            {/* Diagram Style */}
            {availableStyles.length > 0 && (
              <div className="form-group">
                <label className="form-label">Diagram Style</label>
                <select
                  value={diagramStyle}
                  onChange={(e) => setDiagramStyle(e.target.value)}
                  className="form-select"
                >
                  {availableStyles.map((style) => (
                    <option key={style.value} value={style.value}>
                      {style.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={lessonLoading || diagramLoading || !topic.trim()}
              className="generate-btn"
            >
              {(lessonLoading || diagramLoading) ? "⏳ Generating Your AI Lesson..." : "✨ Generate Lesson with Audio"}
            </button>

            {/* Error Messages */}
            {error && <div className="error-message">⚠️ {error}</div>}
            {audioError && <div className="error-message">🔊 {audioError}</div>}
          </section>

          {/* Lesson Loading Spinner */}
          {lessonLoading && (
            <section className="card lesson-loading-card" style={{ textAlign: 'center', padding: '80px 20px' }}>
              <div className="loading-spinner"></div>
              <p style={{ color: 'var(--text-secondary)' }}>Generating lesson content & audio narration...</p>
            </section>
          )}

          {/* Lesson Error Message */}
          {lessonError && !lessonLoading && (
            <section className="card error-card" style={{ border: '1px solid #feb2b2', backgroundColor: '#fff5f5', color: '#c53030', padding: '30px', borderRadius: '8px', textAlign: 'center' }}>
              <div className="placeholder-icon" style={{ fontSize: '3rem', marginBottom: '10px', opacity: 0.5 }}>⚠️</div>
              <h3 style={{ marginBottom: '10px' }}>Lesson Generation Failed</h3>
              <p>{lessonError}</p>
            </section>
          )}

          {/* Lesson Card */}
          {lesson && !lessonLoading && (
            <section className="card lesson-card">
              <div className="card-header">
                <h2 className="card-title-large">📚 {lesson.title}</h2>
                {lessonAudioSrc && (
                  <button
                    onClick={toggleLessonAudio}
                    className="audio-control-btn"
                  >
                    {isPlayingLessonAudio ? "⏸️ Pause Audio" : "▶️ Play Audio"}
                  </button>
                )}
              </div>

              {/* Audio Player */}
              {lessonAudioSrc && (
                <div className="audio-player-container">
                  <p className="audio-label">🎧 Lesson Audio (Auto-play enabled)</p>
                  <audio
                    ref={lessonAudioRef}
                    src={lessonAudioSrc}
                    controls
                    className="audio-element"
                    preload="auto"
                    onPlay={() => {
                      console.log("🎵 Audio started playing");
                      setIsPlayingLessonAudio(true);
                    }}
                    onPause={() => {
                      console.log("⏸️ Audio paused");
                      setIsPlayingLessonAudio(false);
                    }}
                    onEnded={() => {
                      console.log("✅ Audio finished playing");
                      setIsPlayingLessonAudio(false);
                    }}
                    onError={(e) => {
                      console.error("❌ Audio element error:", e);
                      console.error("Error details:", e.target.error);
                      setAudioError("Audio loading failed. Please try again.");
                    }}
                    onLoadedData={() => {
                      console.log("📊 Audio data loaded successfully");
                    }}
                    onLoadedMetadata={(e) => {
                      console.log("📊 Audio metadata loaded, duration:", e.target.duration);
                    }}
                  />
                </div>
              )}

              {/* Lesson Sections */}
              <div className="lesson-section intro-section">
                <h4 className="section-title">📖 Introduction</h4>
                <p className="section-content">{lesson.introduction}</p>
              </div>

              <div className="lesson-section explanation-section">
                <h4 className="section-title">💡 Detailed Explanation</h4>
                <p className="section-content">{lesson.explanation}</p>
              </div>

              <div className="lesson-section analogy-section">
                <h4 className="section-title">🌟 Simple Analogy</h4>
                <p className="section-content">{lesson.analogy}</p>
              </div>

              <div className="lesson-section recap-section">
                <h4 className="section-title">✅ Quick Recap</h4>
                <p className="section-content">{lesson.recap}</p>
              </div>

              {lesson.quiz && (
                <div className="lesson-section quiz-section">
                  <h4 className="section-title">📝 Practice Quiz</h4>
                  <pre className="quiz-content">{lesson.quiz}</pre>
                </div>
              )}

              {/* Doubt Section */}
              {showDoubtSection && (
                <div className="doubt-container">
                  <h4 className="doubt-title">❓ Have Questions? Ask Your Doubts!</h4>
                  <p className="doubt-subtitle">
                    Type or speak your question - AI will answer instantly with audio
                  </p>

                  <textarea
                    value={doubtText}
                    onChange={(e) => setDoubtText(e.target.value)}
                    placeholder="Type your doubt here... e.g., 'Can you explain this with an example?'"
                    className="doubt-textarea"
                    rows={3}
                    maxLength={500}
                    disabled={doubtLoading}
                  />

                  <div className="doubt-actions">
                    <VoiceInput
                      onTranscription={handleDoubtVoiceTranscription}
                      language={language}
                      apiBase={API_BASE}
                      buttonText="🎤 Ask via Voice"
                      disabled={doubtLoading}
                    />

                    <button
                      onClick={() => handleSubmitDoubt()}
                      disabled={!doubtText.trim() || doubtLoading}
                      className="submit-doubt-btn"
                    >
                      {doubtLoading ? "⏳ Processing..." : "📤 Submit Doubt"}
                    </button>
                  </div>

                  {/* Doubt Answer */}
                  {doubtAnswer && (
                    <div className="doubt-answer">
                      <div className="answer-header">
                        <h4 className="answer-title">💬 AI Teacher's Answer</h4>
                        {doubtAudioSrc && (
                          <button
                            onClick={toggleDoubtAudio}
                            className="audio-control-btn-small"
                          >
                            {isPlayingDoubtAudio ? "⏸️" : "▶️"}
                          </button>
                        )}
                      </div>
                      <p className="answer-content">{doubtAnswer}</p>

                      {doubtAudioSrc && (
                        <div className="audio-player-container">
                          <p className="audio-label">🎧 Answer Audio</p>
                          <audio
                            ref={doubtAudioRef}
                            src={doubtAudioSrc}
                            controls
                            className="audio-element"
                            preload="auto"
                            onPlay={() => setIsPlayingDoubtAudio(true)}
                            onPause={() => setIsPlayingDoubtAudio(false)}
                            onEnded={() => setIsPlayingDoubtAudio(false)}
                            onError={() => setAudioError("Answer audio failed to load.")}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Placeholder when no lesson */}
          {!lesson && !lessonLoading && !lessonError && (
            <section className="card placeholder-card">
              <div className="placeholder-content">
                <h3>👆 Enter a topic or use voice input above</h3>
                <p>Your AI-generated lesson with audio narration will appear here</p>
                <div className="placeholder-features">
                  <span>🎤 Voice Input</span>
                  <span>🔊 Auto Audio</span>
                  <span>🌍 Multi-language</span>
                  <span>❓ Doubt Solving</span>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Right Panel - Diagram */}
        <div className="right-panel">
          <section className="card diagram-card">
            <h2 className="card-title">🎨 Educational Diagram</h2>

            {!imageBase64 && !diagramLoading && !diagramError && (
              <div className="diagram-placeholder">
                <div className="placeholder-icon">🖼️</div>
                <p>Visual diagram will appear here...</p>
                <p className="placeholder-hint">AI-generated, contextual images</p>
              </div>
            )}

            {diagramLoading && (
              <div className="diagram-loading">
                <div className="loading-spinner"></div>
                <p>Generating diagram...</p>
              </div>
            )}

            {diagramError && !diagramLoading && (
              <div className="diagram-loading" style={{ color: '#c53030' }}>
                <div className="placeholder-icon" style={{ opacity: 0.5 }}>⚠️</div>
                <p>Failed to generate diagram</p>
                <p style={{ fontSize: '0.85rem', color: '#e53e3e', marginTop: '5px' }}>{diagramError}</p>
              </div>
            )}

            {imageBase64 && !diagramLoading && (
              <div className="diagram-content">
                <img
                  src={`data:image/png;base64,${imageBase64}`}
                  alt="Educational diagram"
                  className="diagram-image"
                />
                <p className="diagram-caption">
                  Style: {diagramStyle.charAt(0).toUpperCase() + diagramStyle.slice(1)} |
                  AI-Generated Visual Aid
                </p>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <p className="footer-brand">VidyaVani · Voice-First AI Education Platform</p>
          <p className="footer-tech">Powered by AWS Bedrock, Polly & Deepgram</p>
          <p className="footer-team">Team NxtGen · Made with ❤️ for Government Schools</p>
        </div>
      </footer>
    </div>
  );
}

export default App;