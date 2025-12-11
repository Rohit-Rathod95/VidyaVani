// VoiceInput.jsx
import { useState, useRef } from 'react';
import './VoiceInput.css';

const VoiceInput = ({ 
  onTranscription, 
  language = "English", 
  apiBase,
  buttonText = "🎤 Voice Input",
  disabled = false 
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
        clearInterval(timerRef.current);
        setRecordingDuration(0);
      };

      mediaRecorder.start();
      setIsRecording(true);
      console.log("🎤 Recording started");
      
      // Start duration timer
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error("Microphone error:", error);
      alert("Failed to access microphone. Please allow microphone access and try again.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      console.log("🎤 Recording stopped");
    }
  };

  const processAudio = async (audioBlob) => {
    setIsProcessing(true);
    
    try {
      console.log(`🔄 Processing audio (${(audioBlob.size / 1024).toFixed(2)} KB)`);
      
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        try {
          const base64Audio = reader.result.split(',')[1];

          const response = await fetch(`${apiBase}/api/transcribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audioData: base64Audio,
              language
            })
          });

          const data = await response.json();

          if (data.success && data.transcription) {
            console.log("✅ Transcribed:", data.transcription);
            onTranscription(data.transcription.trim());
          } else {
            alert("Transcription failed. Please try again.");
          }
        } catch (err) {
          console.error("Transcription error:", err);
          alert("Transcription failed. Please check your connection and try again.");
        } finally {
          setIsProcessing(false);
        }
      };

      reader.readAsDataURL(audioBlob);
      
    } catch (err) {
      console.error("Processing error:", err);
      alert("Audio processing failed. Please try again.");
      setIsProcessing(false);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="voice-input-container">
      <button
        onClick={isRecording ? stopRecording : startRecording}
        disabled={disabled || isProcessing}
        className={`voice-btn ${isRecording ? 'recording' : ''} ${isProcessing ? 'processing' : ''}`}
        type="button"
      >
        {isProcessing 
          ? "⏳ Processing Audio..." 
          : isRecording 
          ? `⏹ Stop Recording (${formatDuration(recordingDuration)})` 
          : buttonText
        }
      </button>

      {isRecording && (
        <div className="recording-indicator">
          <span className="pulse-dot">●</span>
          <span className="recording-text">
            Recording... {formatDuration(recordingDuration)}
          </span>
          <span className="recording-wave">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </div>
      )}

      {isProcessing && (
        <div className="processing-indicator">
          <div className="processing-spinner"></div>
          <span>Converting speech to text...</span>
        </div>
      )}
    </div>
  );
};

export default VoiceInput;