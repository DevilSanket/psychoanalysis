import { useState, useEffect } from "react";
import {
  fetchFallingThroughCracks,
  addQuickObservation,
  type FallingThroughCracksResponse,
  type FlaggedChild,
} from "../api";
import { useToast } from "../toast";

interface FallingThroughCracksProps {
  onSelectChild?: (childName: string, balgruhaName: string) => void;
}

export default function FallingThroughCracks({ onSelectChild }: FallingThroughCracksProps) {
  const toast = useToast();
  const [data, setData] = useState<FallingThroughCracksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  // Modal state
  const [targetChild, setTargetChild] = useState<FlaggedChild | null>(null);
  const [obsDate, setObsDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [reportTitle, setReportTitle] = useState<string>("Psychological Follow-up Assessment");
  const [observationsText, setObservationsText] = useState<string>("");
  const [actionItemsText, setActionItemsText] = useState<string>("");
  const [riskCategory, setRiskCategory] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

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

  const handleOpenModal = (child: FlaggedChild) => {
    setTargetChild(child);
    setObsDate(new Date().toISOString().split("T")[0]);
    setReportTitle(`Follow-up Assessment (${child.child_name})`);
    setObservationsText("");
    setActionItemsText("");
    setRiskCategory("");
  };

  const handleCloseModal = () => {
    setTargetChild(null);
  };

  const handleSubmitQuickObs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetChild) return;
    if (!observationsText.trim()) {
      toast.error("Please enter observation notes!");
      return;
    }

    setSubmitting(true);
    try {
      const actionItems = actionItemsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      await addQuickObservation(targetChild._id, {
        date: obsDate,
        report_title: reportTitle,
        observations: observationsText.trim(),
        action_items: actionItems,
        risk_category: riskCategory || undefined,
      });

      toast.success(`Observation saved for ${targetChild.child_name}! Assessment gap updated.`);
      handleCloseModal();
      loadData(); // reload gap list to clear child if fixed
    } catch (err: any) {
      toast.error("Failed to add observation: " + (err?.message || String(err)));
    } finally {
      setSubmitting(false);
    }
  };

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

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                <button
                  onClick={() => handleOpenModal(child)}
                  className="btn btn-primary"
                  style={{ flex: 1, fontSize: "0.8rem", padding: "8px 12px", background: "var(--md-sys-color-primary, #0369a1)" }}
                >
                  📝 Add Quick Obs
                </button>
                {onSelectChild && (
                  <button
                    onClick={() => onSelectChild(child.child_name, child.balgruha_name)}
                    className="btn btn-secondary"
                    style={{ fontSize: "0.8rem", padding: "8px 12px" }}
                    title="View full roster profile"
                  >
                    👤 View Profile
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal for Quick Observation ── */}
      {targetChild && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "20px",
              padding: "28px",
              width: "100%",
              maxWidth: "580px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "14px", marginBottom: "18px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "#020617" }}>
                  📝 Add Quick Observation
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "#64748b" }}>
                  Child: <strong>{targetChild.child_name}</strong> · 🏠 {targetChild.balgruha_name}
                </p>
              </div>
              <button
                onClick={handleCloseModal}
                style={{ border: "none", background: "none", fontSize: "1.4rem", cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitQuickObs} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                    Assessment Date
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
                    value={obsDate}
                    onChange={(e) => setObsDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                    Update Risk Status Tier
                  </label>
                  <select
                    className="form-select"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
                    value={riskCategory}
                    onChange={(e) => setRiskCategory(e.target.value)}
                  >
                    <option value="">Keep Existing Risk Category</option>
                    <option value="high_risk">🔴 High Risk</option>
                    <option value="trauma_unprocessed">🟧 Trauma Unprocessed</option>
                    <option value="identity_formation">🟨 Identity Formation</option>
                    <option value="well_adjusted">🟩 Well Adjusted</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                  Report / Visit Title
                </label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  placeholder="e.g. Follow-up Assessment"
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                  Psychological Observations &amp; Notes *
                </label>
                <textarea
                  className="form-input"
                  rows={4}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", resize: "vertical" }}
                  value={observationsText}
                  onChange={(e) => setObservationsText(e.target.value)}
                  placeholder="Enter clinical observations, behavioral progress, emotional state, or session notes..."
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                  New Action Items / Tasks (Optional - one per line)
                </label>
                <textarea
                  className="form-input"
                  rows={2}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", resize: "vertical" }}
                  value={actionItemsText}
                  onChange={(e) => setActionItemsText(e.target.value)}
                  placeholder="e.g. Schedule medical follow-up&#10;Follow up on Aadhar card"
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px", borderTop: "1px solid #e2e8f0", paddingTop: "14px" }}>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="btn btn-secondary"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                  style={{ background: "var(--md-sys-color-primary, #0369a1)" }}
                >
                  {submitting ? "Saving Observation..." : "💾 Save Observation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
