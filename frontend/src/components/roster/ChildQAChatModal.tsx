import { useState } from "react";

export interface ChatMessage {
  sender: "user" | "ai";
  text: string;
}

export interface ChildQAChatModalProps {
  childName: string;
  chatHistory: ChatMessage[];
  chatLoading: boolean;
  onSendMessage: (question: string) => Promise<void>;
}

export default function ChildQAChatModal({
  childName,
  chatHistory,
  chatLoading,
  onSendMessage,
}: ChildQAChatModalProps) {
  const [input, setInput] = useState("");

  const handleSend = async (text: string) => {
    const q = text.trim();
    if (!q || chatLoading) return;
    setInput("");
    await onSendMessage(q);
  };

  return (
    <div className="assistant-card" style={{ marginTop: 16 }}>
      <div className="assistant-card-header">
        <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          <span className="msym" style={{ color: "var(--md-sys-color-primary, #0369a1)" }}>smart_toy</span>
          AI Child Q&amp;A Assistant
        </h4>
        <span className="badge badge-info" style={{ fontSize: "0.75rem" }}>
          Context: {childName}
        </span>
      </div>

      <div className="chat-messages">
        {chatHistory.length === 0 ? (
          <div className="chat-placeholder">
            <span className="msym">chat</span>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>
              Ask me anything about {childName}'s profiles and observations!
            </p>
            <p className="muted" style={{ margin: 0, fontSize: 11 }}>
              Example: "Any behavioral concerns?" or "What are their strengths?"
            </p>
          </div>
        ) : (
          chatHistory.map((msg, index) => (
            <div key={index} className={`chat-bubble ${msg.sender}`}>
              {msg.text}
            </div>
          ))
        )}
        {chatLoading && (
          <div className="chat-bubble ai" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="spin msym" style={{ fontSize: 16 }}>
              progress_activity
            </span>
            Thinking…
          </div>
        )}
      </div>

      {/* Suggestion Chips */}
      <div className="suggestion-chips">
        <button
          className="suggestion-chip"
          onClick={() => handleSend("What are the recurring themes in the logs?")}
          disabled={chatLoading}
        >
          <span className="msym">psychology</span> Recurring Themes
        </button>
        <button
          className="suggestion-chip"
          onClick={() => handleSend("Summarize the progress or regression of the child.")}
          disabled={chatLoading}
        >
          <span className="msym">trending_up</span> Progress Summary
        </button>
        <button
          className="suggestion-chip"
          onClick={() => handleSend("What are the key counselor focus areas?")}
          disabled={chatLoading}
        >
          <span className="msym">target</span> Focus Areas
        </button>
      </div>

      <div className="chat-input-row">
        <input
          className="chat-input"
          placeholder="Ask a question..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !chatLoading) {
              handleSend(input);
            }
          }}
          disabled={chatLoading}
        />
        <button
          className="chat-send-btn"
          onClick={() => handleSend(input)}
          disabled={chatLoading || !input.trim()}
        >
          <span className="msym">send</span>
        </button>
      </div>
    </div>
  );
}
