import { useState, useRef, useEffect, useCallback } from "react";
import { extractFileText } from "../api";
import { useToast } from "../toast";

export interface LiveTranscriptionProps {
  onTranscriptionComplete: (text: string) => void;
  onCancel?: () => void;
}

export default function LiveTranscription({ onTranscriptionComplete, onCancel }: LiveTranscriptionProps) {
  const toast = useToast();
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [language, setLanguage] = useState<"en-IN" | "hi-IN" | "mr-IN">("en-IN");
  
  // Transcription state
  const [liveTranscript, setLiveTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [editedTranscript, setEditedTranscript] = useState("");
  const [processingQueue, setProcessingQueue] = useState<Blob[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkIndexRef = useRef(0);
  const isProcessingRef = useRef(false);
  
  const languageNames = {
    "en-IN": "English (India)",
    "hi-IN": "हिंदी (Hindi)",
    "mr-IN": "मराठी (Marathi)",
  };

  // Process audio chunks queue
  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || processingQueue.length === 0) return;
    
    isProcessingRef.current = true;
    setIsProcessing(true);
    
    const chunk = processingQueue[0];
    const formData = new FormData();
    formData.append("file", chunk, `chunk_${chunkIndexRef.current}.webm`);
    
    try {
      const response = await extractFileText(new File([chunk], `chunk_${chunkIndexRef.current}.webm`, { type: "audio/webm" }));
      if (response.text && response.text.trim()) {
        const newText = response.text.trim();
        setLiveTranscript((prev) => {
          const combined = prev + (prev ? " " : "") + newText;
          return combined;
        });
      }
    } catch (e) {
      console.error("Transcription failed:", e);
    } finally {
      setProcessingQueue((prev) => prev.slice(1));
      chunkIndexRef.current += 1;
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, [processingQueue]);

  // Process queue when it changes
  useEffect(() => {
    if (processingQueue.length > 0 && !isProcessingRef.current) {
      processQueue();
    }
  }, [processingQueue, processQueue]);

  // Start recording
  const startRecording = async () => {
    try {
      setError(null);
      setLiveTranscript("");
      setFinalTranscript("");
      setEditedTranscript("");
      audioChunksRef.current = [];
      chunkIndexRef.current = 0;
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        } 
      });
      
      streamRef.current = stream;
      audioChunksRef.current = [];
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          setProcessingQueue((prev) => [...prev, event.data]);
        }
      };
      
      mediaRecorder.onstop = () => {
        // Process any remaining chunks
        if (audioChunksRef.current.length > 0) {
          const fullBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          setProcessingQueue((prev) => [...prev, fullBlob]);
        }
      };
      
      // Record in 4-second chunks for near real-time transcription
      mediaRecorder.start(4000);
      setIsRecording(true);
      toast.info(`Recording started — speak in ${languageNames[language]}`);
    } catch (e) {
      setError("Microphone access denied. Please allow microphone permissions.");
      toast.error("Microphone access denied");
    }
  };

  // Cancel recording
  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    }
    setIsRecording(false);
    setLiveTranscript("");
    setFinalTranscript("");
    setEditedTranscript("");
    setProcessingQueue([]);
    audioChunksRef.current = [];
    onCancel?.();
  };

  // Finalize and send to parent
  const finalizeTranscription = () => {
    const finalText = editedTranscript || liveTranscript || finalTranscript;
    if (finalText.trim()) {
      onTranscriptionComplete(finalText.trim());
    }
  };

  // Format duration
  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Calculate recording duration
  const recordingStartTime = useRef<number>(0);
  const [duration, setDuration] = useState(0);
  
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording) {
      recordingStartTime.current = Date.now();
      interval = setInterval(() => {
        setDuration(Date.now() - recordingStartTime.current);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  return (
    <div className="live-transcription">
      {/* Language Selector */}
      <div className="transcription-header">
        <div className="language-selector">
          <label className="msym" htmlFor="transcription-language">translate</label>
          <select
            id="transcription-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as "en-IN" | "hi-IN" | "mr-IN")}
            disabled={isRecording || isProcessing}
            className="language-select"
          >
            <option value="en-IN">🇮🇳 English (India)</option>
            <option value="hi-IN">🇮🇳 हिंदी (Hindi)</option>
            <option value="mr-IN">🇮🇳 मराठी (Marathi)</option>
          </select>
        </div>
        
        {/* Recording Status */}
        <div className={`recording-status ${isRecording ? "recording" : ""} ${isProcessing ? "processing" : ""}`}>
          {isRecording && (
            <>
              <span className="recording-indicator" aria-live="polite">
                <span className="pulse-dot" />
                REC
              </span>
              <span className="duration">{formatDuration(duration)}</span>
            </>
          )}
          {isProcessing && !isRecording && (
            <span className="processing-indicator">
              <span className="spinner-sm" />
              Processing audio…
            </span>
          )}
          {!isRecording && !isProcessing && liveTranscript && (
            <span className="ready-indicator">
              <span className="msym">check_circle</span>
              Ready to review
            </span>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="alert alert-error transcription-error">
          <span className="msym">mic_off</span>
          {error}
        </div>
      )}

      {/* Live Transcription Preview */}
      <div className="transcription-preview-wrapper">
        <label className="preview-label">
          <span>Live Transcription</span>
          {liveTranscript && (
            <span className="char-count">{liveTranscript.length} characters</span>
          )}
        </label>
        
        <div className="transcription-display">
          <textarea
            className="transcription-textarea"
            value={liveTranscript}
            readOnly
            placeholder={isRecording ? "Listening…" : "Start recording to see live transcription"}
            aria-label="Live transcription preview"
          />
          
          {isRecording && (
            <div className="recording-overlay">
              <span className="msym">mic</span>
              <span>Recording… speak clearly</span>
            </div>
          )}
        </div>
      </div>

      {/* Editable Final Transcription */}
      {(finalTranscript || liveTranscript) && !isRecording && (
        <div className="editable-transcription-section">
          <label className="preview-label">
            <span>Review & Edit Transcription</span>
            <span className="hint">AI can make mistakes — review and correct before saving</span>
          </label>
          
          <textarea
            className="editable-textarea"
            value={editedTranscript || liveTranscript}
            onChange={(e) => setEditedTranscript(e.target.value)}
            placeholder="Transcription will appear here…"
            rows={6}
            aria-label="Edit transcription before saving"
          />
          
          <div className="transcription-actions">
            <button
              className="btn btn-outlined"
              onClick={() => setEditedTranscript(liveTranscript)}
              disabled={editedTranscript === liveTranscript}
            >
              <span className="msym">restore</span>
              Reset to Original
            </button>
            
            <button
              className="btn btn-primary"
              onClick={finalizeTranscription}
              disabled={!(editedTranscript?.trim() || liveTranscript?.trim())}
            >
              <span className="msym">check</span>
              Use This Transcription
            </button>
            
            <button
              className="btn btn-tonal"
              onClick={cancelRecording}
            >
              <span className="msym">close</span>
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Initial State - Start Recording Button */}
      {!isRecording && !liveTranscript && !finalTranscript && (
        <div className="transcription-initial-state">
          <div className="initial-icon">
            <span className="msym">mic</span>
          </div>
          <h3>Live Voice Transcription</h3>
          <p>Record your observations in <strong>English</strong>, <strong>Hindi</strong>, or <strong>Marathi</strong>.</p>
          <ul className="feature-list">
            <li><span className="msym">check_circle</span> Real-time transcription powered by Gemini</li>
            <li><span className="msym">check_circle</span> Supports Indian accents & mixed languages</li>
            <li><span className="msym">check_circle</span> Review & edit before saving</li>
          </ul>
          <button className="btn btn-primary btn-lg start-recording-btn" onClick={startRecording}>
            <span className="msym">mic</span>
            Start Recording
          </button>
          <p className="privacy-note">
            <span className="msym">lock</span>
            Audio is processed securely and not stored permanently
          </p>
        </div>
      )}
    </div>
  );
}