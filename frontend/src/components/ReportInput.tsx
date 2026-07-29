import { useState, useEffect } from "react";
import { extractReport, extractFileText, ApiError, type ExtractResponse } from "../api";
import { useToast } from "../toast";
import LiveTranscription from "./LiveTranscription";

interface Props {
  onExtracted: (result: ExtractResponse, meta: {
    centerName: string;
    centerId: string;
    reportTitle: string;
    reportDate: string;
    coaches: string[];
    rawReport: string;
  }) => void;
}

export default function ReportInput({ onExtracted }: Props) {
  const toast = useToast();
  const [rawReport, setRawReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // File upload state
  const [fileLoading, setFileLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const [speechLanguage, setSpeechLanguage] = useState<"en-IN" | "hi-IN">("en-IN");

  // Live transcription state
  const [showLiveTranscription, setShowLiveTranscription] = useState(false);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      
      rec.onresult = (event: any) => {
        let interimTranscript = "";
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setRawReport((prev) => prev + (prev ? " " : "") + finalTranscript);
        }
      };
      
      rec.onerror = (e: any) => {
        console.error("Speech recognition error:", e);
        setIsRecording(false);
      };
      
      rec.onend = () => {
        setIsRecording(false);
      };
      
      setRecognition(rec);
    }
  }, []);

  // Auto-restore draft from localStorage on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem("isf_report_draft_text");
    if (savedDraft) {
      setRawReport(savedDraft);
    }
  }, []);

  // Auto-save draft to localStorage whenever rawReport changes
  useEffect(() => {
    if (rawReport.trim()) {
      localStorage.setItem("isf_report_draft_text", rawReport);
    } else {
      localStorage.removeItem("isf_report_draft_text");
    }
  }, [rawReport]);

  const toggleRecording = () => {
    if (!recognition) {
      toast.error("Speech recognition is not supported in this browser. Try Chrome or Edge.");
      return;
    }
    if (isRecording) {
      recognition.stop();
      setIsRecording(false);
    } else {
      recognition.lang = speechLanguage;
      recognition.start();
      setIsRecording(true);
      toast.info(`Voice dictation started. Speak in ${speechLanguage === "hi-IN" ? "Hindi" : "English"}...`);
    }
  };

  const handleLiveTranscriptionComplete = (text: string) => {
    setRawReport((prev) => prev + (prev ? "\n\n" : "") + text);
    setShowLiveTranscription(false);
    toast.success("Transcription added to report");
  };

  const handleFileUpload = async (file: File) => {
    setFileLoading(true);
    setError(null);
    try {
      const res = await extractFileText(file);
      if (res.text) {
        setRawReport((prev) => prev + (prev ? "\n\n" : "") + res.text);
        toast.success(`Extracted text from ${file.name}`);
      }
    } catch (e) {
      setError(`Failed to extract text from file: ${String(e)}`);
    } finally {
      setFileLoading(false);
    }
  };

  const handleProcess = async (force: boolean = false) => {
    if (!rawReport.trim()) return;
    setLoading(true);
    setError(null);
    setDuplicateWarning(null);
    try {
      const result = await extractReport({
        raw_report: rawReport.trim(),
        report_title: "Untitled Report",
        report_date: "",
        coaches: [],
        center_id: undefined,
        center_name: undefined,
        force,
      });

      if (result.error) {
        setError(result.error);
      } else if (!result.matched_children?.length) {
        setError(
          "No children were extracted. Try adding more detail to the report.",
        );
      } else {
        onExtracted(result, {
          centerName: result.extracted_center_name || "",
          centerId: result.extracted_center_id || "",
          reportTitle: result.extracted_report_title || "Untitled Report",
          reportDate: result.extracted_report_date || new Date().toISOString().slice(0, 10),
          coaches: result.extracted_coaches || [],
          rawReport: rawReport.trim(),
        });
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setDuplicateWarning(e.message);
      } else {
        setError(String(e));
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="spinner-overlay">
        <div className="spin-ring" />
        <h3>Analyzing report with Gemini…</h3>
        <p className="muted">
          Extracting metadata, children profiles, observations & action items
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Hero */}
      <div className="hero-banner">
        <div className="hero-eyebrow">
          <span className="msym" aria-hidden="true">psychology</span>
          ISF · Share Your Day
        </div>
        <h1>Share Your Day</h1>
        <p>
          We are here to listen. Share your observations, field updates, or notes about the children, and we'll help track their progress.
        </p>
      </div>

      {error && (
        <div className="alert alert-error">
          <span className="msym">error</span>
          {error}
        </div>
      )}

      {duplicateWarning && (
        <div className="alert alert-warn row-wrap gap-8" style={{ alignItems: "center" }}>
          <span className="msym">warning</span>
          <div className="grow">
            <strong>Duplicate Warning:</strong> {duplicateWarning}
          </div>
          <button
            className="btn btn-tonal btn-sm"
            onClick={() => handleProcess(true)}
          >
            Process anyway
          </button>
        </div>
      )}

      {/* ── Step 1: File Uploader ── */}
      <div 
        className={`file-upload-zone ${isDragOver ? "dragover" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          const files = e.dataTransfer.files;
          if (files && files.length > 0) {
            handleFileUpload(files[0]);
          }
        }}
        style={{
          border: "2px dashed var(--md-sys-color-outline-variant)",
          borderRadius: 12,
          padding: 24,
          textAlign: "center",
          backgroundColor: isDragOver ? "rgba(var(--md-sys-color-primary-rgb), 0.08)" : "transparent",
          cursor: "pointer",
          transition: "all 0.2s ease-in-out",
          marginBottom: 28,
        }}
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".docx,.pdf,.txt,.md,.text,.png,.jpg,.jpeg,.webp,.bmp,.mp3,.wav,.m4a,.ogg,.flac,.webm,.aac";
          input.onchange = (e: any) => {
            const files = e.target.files;
            if (files && files.length > 0) {
              handleFileUpload(files[0]);
            }
          };
          input.click();
        }}
      >
        <span className="msym" style={{ fontSize: 32, color: "var(--md-sys-color-primary)", marginBottom: 8, display: "block" }}>
          cloud_upload
        </span>
        {fileLoading ? (
          <div>
            <span className="spin msym" style={{ fontSize: 24, marginBottom: 8, display: "block" }}>progress_activity</span>
            <p className="muted" style={{ margin: 0 }}>Extracting content using AI...</p>
          </div>
        ) : (
          <div>
            <p style={{ fontWeight: 500, margin: "0 0 4px 0" }}>
              Drag & drop report, images, or audio here, or click to browse
            </p>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Supports DOCX, PDF, TXT, PNG, JPG, MP3, WAV, M4A, etc. (Max 100 MB)
            </p>

          </div>
        )}
      </div>

      {/* ── Live Transcription (Gemini-powered) ── */}
      {showLiveTranscription && (
        <LiveTranscription
          onTranscriptionComplete={handleLiveTranscriptionComplete}
          onCancel={() => setShowLiveTranscription(false)}
        />
      )}

      <hr className="card-divider" />

      {/* ── Step 2: Report text & voice dictate ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <h2 className="section-heading" style={{ margin: 0 }}>
          <span className="msym">description</span> Write or Record Field Updates
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            className={`btn btn-sm ${showLiveTranscription ? "btn-primary" : "btn-tonal"}`}
            onClick={() => setShowLiveTranscription(!showLiveTranscription)}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <span className="msym">{showLiveTranscription ? "mic" : "mic_none"}</span>
            {showLiveTranscription ? "Live Transcription" : "Live Transcribe"}
          </button>
          <select
            className="form-select"
            style={{ padding: "4px 8px", fontSize: 12, height: "auto", minWidth: 110 }}
            value={speechLanguage}
            onChange={(e) => setSpeechLanguage(e.target.value as any)}
            disabled={isRecording}
          >
            <option value="en-IN">English (IN)</option>
            <option value="hi-IN">Hindi (हिंदी)</option>
          </select>
          <button
            className={`btn btn-sm ${isRecording ? "btn-danger" : "btn-tonal"}`}
            onClick={toggleRecording}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <span className={`msym ${isRecording ? "pulse" : ""}`}>
              {isRecording ? "mic" : "mic_none"}
            </span>
            {isRecording ? "Recording..." : "Voice Dictate"}
          </button>
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: 28 }}>
        <textarea
          id="raw-report"
          className="form-textarea"
          rows={12}
          placeholder={
            "Type your report, upload files, or use voice dictation above...\n\nExample:\nToday we visited the centre and met with Rahul Sharma who showed signs of anxiety..."
          }
          value={rawReport}
          onChange={(e) => setRawReport(e.target.value)}
        />
      </div>

      {/* ── Buttons ── */}
      <div className="row gap-12">
        <button
          className="btn btn-primary btn-block grow"
          disabled={!rawReport.trim() || fileLoading}
          onClick={() => handleProcess()}
        >
          <span className="msym">search</span>
          Process Report with AI
        </button>
      </div>
    </>
  );
}

