import { useState, useEffect } from "react";
import {
  fetchFallingThroughCracks,
  type FallingThroughCracksResponse,
} from "../api";

interface FallingThroughCracksProps {
  onSelectChild?: (childName: string, balgruhaName: string) => void;
}

export default function FallingThroughCracks({ onSelectChild }: FallingThroughCracksProps) {
  const [data, setData] = useState<FallingThroughCracksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFallingThroughCracks();
      setData(res);
    } catch (err: any) {
      setError(err?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <div className="spinner" style={{ margin: "0 auto 16px" }} />
        <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
          Scanning child records for assessment gaps...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: "24px", textAlign: "center" }} className="card">
        <p style={{ color: "var(--accent-red)", marginBottom: "12px" }}>
          ⚠️ {error || "Failed to load report"}
        </p>
        <button onClick={loadData} className="btn btn-secondary">
          Retry Loading
        </button>
      </div>
    );
  }

  const { summary, children } = data;

  const filteredChildren = children.filter((child) => {
    if (activeFilter === "all") return true;
    return child.flag_reasons.some((r) => r.key === activeFilter);
  });

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return { bg: "#fee2e2", color: "#dc2626", label: "🚨 Critical" };
      case "high":
        return { bg: "#fef3c7", color: "#b45309", label: "⚠️ High Priority" };
      case "medium":
        return { bg: "#fef9c3", color: "#854d0e", label: "⚡ Attention Needed" };
      default:
        return { bg: "#f1f5f9", color: "#475569", label: "ℹ️ Review" };
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Top Banner Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          padding: "20px 24px",
          background: "linear-gradient(135deg, #fef2f2 0%, #ffffff 100%)",
          borderRadius: "16px",
          border: "1px solid #fecaca",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 700, color: "var(--md-sys-color-on-surface, #020617)" }}>
            🚨 Children Falling Through the Cracks
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--md-sys-color-on-surface-variant, #475569)" }}>
            Immediate assessment overview for children missing regular observations, follow-ups, or coach reviews
          </p>
        </div>

        <div style={{ padding: "8px 16px", borderRadius: "20px", background: "#fee2e2", color: "#dc2626", fontWeight: 700, fontSize: "0.9rem" }}>
          {summary.total_flagged} children flagged out of {summary.total_children}
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
        <div
          onClick={() => setActiveFilter("never_observed")}
          style={{
            cursor: "pointer",
            padding: "16px 20px",
            borderRadius: "14px",
            background: activeFilter === "never_observed" ? "#fee2e2" : "#ffffff",
            border: `1px solid ${activeFilter === "never_observed" ? "#ef4444" : "#e2e8f0"}`,
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            transition: "all 0.2s ease",
          }}
        >
          <div style={{ fontSize: "0.8rem", color: "var(--md-sys-color-on-surface-variant, #475569)", fontWeight: 600 }}>Never Received First Obs</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#dc2626", marginTop: "6px" }}>{summary.never_observed}</div>
        </div>

        <div
          onClick={() => setActiveFilter("inactive_30d")}
          style={{
            cursor: "pointer",
            padding: "16px 20px",
            borderRadius: "14px",
            background: activeFilter === "inactive_30d" ? "#fef3c7" : "#ffffff",
            border: `1px solid ${activeFilter === "inactive_30d" ? "#f59e0b" : "#e2e8f0"}`,
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            transition: "all 0.2s ease",
          }}
        >
          <div style={{ fontSize: "0.8rem", color: "var(--md-sys-color-on-surface-variant, #475569)", fontWeight: 600 }}>Last Session &gt; 30 Days Ago</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#d97706", marginTop: "6px" }}>{summary.inactive_30d}</div>
        </div>

        <div
          onClick={() => setActiveFilter("no_high_risk_followup")}
          style={{
            cursor: "pointer",
            padding: "16px 20px",
            borderRadius: "14px",
            background: activeFilter === "no_high_risk_followup" ? "#f3e8ff" : "#ffffff",
            border: `1px solid ${activeFilter === "no_high_risk_followup" ? "#c084fc" : "#e2e8f0"}`,
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            transition: "all 0.2s ease",
          }}
        >
          <div style={{ fontSize: "0.8rem", color: "var(--md-sys-color-on-surface-variant, #475569)", fontWeight: 600 }}>No Follow-up after High Risk</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#7e22ce", marginTop: "6px" }}>{summary.no_high_risk_followup}</div>
        </div>

        <div
          onClick={() => setActiveFilter("no_coach_obs")}
          style={{
            cursor: "pointer",
            padding: "16px 20px",
            borderRadius: "14px",
            background: activeFilter === "no_coach_obs" ? "#e0f2fe" : "#ffffff",
            border: `1px solid ${activeFilter === "no_coach_obs" ? "#60a5fa" : "#e2e8f0"}`,
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            transition: "all 0.2s ease",
          }}
        >
          <div style={{ fontSize: "0.8rem", color: "var(--md-sys-color-on-surface-variant, #475569)", fontWeight: 600 }}>No Coach Observations</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#0284c7", marginTop: "6px" }}>{summary.no_coach_obs}</div>
        </div>
      </div>

      {/* Filter Reset Pill */}
      {activeFilter !== "all" && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--md-sys-color-on-surface-variant, #475569)" }}>
            Showing filter: <strong>{activeFilter.replace(/_/g, " ")}</strong> ({filteredChildren.length} children)
          </span>
          <button onClick={() => setActiveFilter("all")} className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: "0.78rem" }}>
            ✕ Show All ({children.length})
          </button>
        </div>
      )}

      {/* Children List */}
      {filteredChildren.length === 0 ? (
        <div style={{ padding: "30px", textAlign: "center", background: "#f8fafc", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
          <p style={{ color: "var(--md-sys-color-on-surface-variant, #475569)", fontStyle: "italic" }}>
            No children match this specific assessment gap criterion.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
          {filteredChildren.map((child) => (
            <div
              key={child._id}
              style={{
                padding: "20px",
                borderRadius: "16px",
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "1.05rem",
                      fontWeight: 700,
                      color: "var(--md-sys-color-primary, #0369a1)",
                      cursor: onSelectChild ? "pointer" : "default",
                    }}
                    onClick={() => onSelectChild && onSelectChild(child.child_name, child.balgruha_name)}
                  >
                    {child.child_name}
                  </h3>
                  <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--md-sys-color-on-surface-variant, #475569)" }}>
                    🏠 {child.balgruha_name}
                  </p>
                </div>

                <div
                  style={{
                    padding: "4px 10px",
                    borderRadius: "8px",
                    background: "#f1f5f9",
                    fontSize: "0.78rem",
                    color: "var(--md-sys-color-on-surface-variant, #475569)",
                    fontWeight: 600,
                  }}
                >
                  📅 {child.last_session_date}
                </div>
              </div>

              {/* Flag Reasons */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--md-sys-color-on-surface-variant, #475569)", fontWeight: 600 }}>
                  Assessment Gaps Detected:
                </span>
                {child.flag_reasons.map((reason, idx) => {
                  const badge = getSeverityBadge(reason.severity);
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "8px",
                        background: badge.bg,
                        color: badge.color,
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>• {reason.label}</span>
                      <span style={{ fontSize: "0.72rem", opacity: 0.8 }}>{badge.label}</span>
                    </div>
                  );
                })}
              </div>
              {onSelectChild && (
                <button
                  onClick={() => onSelectChild(child.child_name, child.balgruha_name)}
                  className="btn btn-secondary"
                  style={{ width: "100%", marginTop: "4px", fontSize: "0.8rem", padding: "6px 12px" }}
                >
                  Open Profile &amp; Add Observation →
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
