import { useState, useEffect } from "react";
import {
  fetchBehavioralTimeline,
  type BehavioralTimelineResponse,
  type BehavioralPoint,
} from "../api";
import { useToast } from "../toast";

interface BehavioralTimelineProps {
  childId: string;
  childName?: string;
}

export default function BehavioralTimeline({ childId }: BehavioralTimelineProps) {
  const toast = useToast();
  const [data, setData] = useState<BehavioralTimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number>(0);

  const loadTimeline = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetchBehavioralTimeline(childId, refresh);
      setData(res);
      if (res.timeline && res.timeline.length > 0) {
        setSelectedPointIndex(res.timeline.length - 1); // select latest session by default
      }
      if (refresh) toast.success("Behavioral timeline re-evaluated!");
    } catch (err: any) {
      setError(err?.message || "Failed to load behavioral timeline");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (childId) loadTimeline();
  }, [childId]);

  if (loading) {
    return (
      <div style={{ padding: "30px", textAlign: "center" }}>
        <div className="spinner" style={{ margin: "0 auto 12px" }} />
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          AI evaluating behavioral progress timeline across sessions...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: "16px", borderRadius: "12px", background: "#ffffff", border: "1px solid #fee2e2", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <p style={{ color: "#dc2626", fontSize: "0.85rem", margin: "0 0 8px" }}>
          ⚠️ {error || "No timeline data available"}
        </p>
        <button onClick={() => loadTimeline(true)} className="btn btn-secondary" style={{ fontSize: "0.78rem" }}>
          Retry AI Evaluation
        </button>
      </div>
    );
  }

  const { timeline } = data;

  if (!timeline || timeline.length === 0) {
    return (
      <div style={{ padding: "20px", textAlign: "center", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
        <p style={{ color: "var(--md-sys-color-on-surface-variant, #475569)", fontSize: "0.85rem", fontStyle: "italic" }}>
          No session reports available to generate a behavioral timeline.
        </p>
      </div>
    );
  }

  const selectedPoint: BehavioralPoint = timeline[selectedPointIndex] || timeline[0];

  const parameterLabels: { key: keyof BehavioralPoint; label: string; icon: string }[] = [
    { key: "anger_control", label: "Anger Control", icon: "🔥" },
    { key: "aggression_control", label: "Aggression Control", icon: "🛡️" },
    { key: "social_interaction", label: "Social Interaction", icon: "👥" },
    { key: "confidence", label: "Confidence", icon: "✨" },
    { key: "sleep_quality", label: "Sleep Quality", icon: "🌙" },
    { key: "attachment", label: "Healthy Attachment", icon: "🤝" },
    { key: "emotional_vocabulary", label: "Emotional Vocabulary", icon: "🗣️" },
  ];

  const getScoreColor = (val: number) => {
    if (val >= 8) return "#16a34a"; // Green
    if (val >= 5) return "#d97706"; // Amber
    return "#dc2626"; // Red
  };

  return (
    <div
      style={{
        padding: "20px",
        borderRadius: "16px",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        display: "flex",
        flexDirection: "column",
        gap: "18px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--md-sys-color-on-surface, #020617)" }}>
            📈 AI Progress Analytics (Week-by-Week Behavioral Timeline)
          </h3>
          <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "var(--md-sys-color-on-surface-variant, #475569)" }}>
            Multi-parameter tracking across {timeline.length} observation milestones
          </p>
        </div>

        <button
          onClick={() => loadTimeline(true)}
          disabled={refreshing}
          className="btn btn-secondary"
          style={{ padding: "4px 10px", fontSize: "0.75rem" }}
        >
          {refreshing ? "Re-evaluating..." : "🔄 Refresh Timeline"}
        </button>
      </div>

      {/* Week Navigation Timeline Bar */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          overflowX: "auto",
          paddingBottom: "8px",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        {timeline.map((pt, idx) => {
          const isSelected = idx === selectedPointIndex;
          return (
            <button
              key={idx}
              onClick={() => setSelectedPointIndex(idx)}
              style={{
                padding: "8px 14px",
                borderRadius: "12px",
                border: isSelected ? "none" : "1px solid #cbd5e1",
                background: isSelected ? "var(--md-sys-color-primary, #0369a1)" : "#f8fafc",
                color: isSelected ? "#ffffff" : "var(--md-sys-color-on-surface-variant, #475569)",
                fontWeight: 600,
                fontSize: "0.78rem",
                cursor: "pointer",
                whiteSpace: "nowrap",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "2px",
              }}
            >
              <span>{pt.week_label || `Point ${idx + 1}`}</span>
              <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>{pt.date}</span>
            </button>
          );
        })}
      </div>

      {/* Selected Point Breakdown */}
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4 style={{ margin: 0, fontSize: "0.95rem", color: "var(--md-sys-color-primary, #0369a1)", fontWeight: 700 }}>
            📌 {selectedPoint.week_label} ({selectedPoint.date}) — {selectedPoint.report_title}
          </h4>
          <span style={{ fontSize: "0.8rem", color: "var(--md-sys-color-on-surface-variant, #475569)", fontStyle: "italic" }}>
            {selectedPoint.key_milestone}
          </span>
        </div>

        {/* 7 Parameter Progress Bars Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
          {parameterLabels.map((param) => {
            const rawVal = selectedPoint[param.key];
            const val = typeof rawVal === "number" ? rawVal : 5;
            const color = getScoreColor(val);

            return (
              <div
                key={param.key}
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: 600 }}>
                  <span style={{ color: "var(--md-sys-color-on-surface, #020617)" }}>
                    {param.icon} {param.label}
                  </span>
                  <span style={{ color: color, fontWeight: 800 }}>{val} / 10</span>
                </div>

                {/* Progress Bar Container */}
                <div
                  style={{
                    width: "100%",
                    height: "8px",
                    borderRadius: "4px",
                    background: "#e2e8f0",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(val / 10) * 100}%`,
                      height: "100%",
                      background: color,
                      borderRadius: "4px",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
