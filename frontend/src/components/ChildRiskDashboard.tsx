import { useState, useEffect } from "react";
import {
  fetchRiskDashboard,
  updateChildRiskProfile,
  type RiskDashboardResponse,
} from "../api";
import { useToast } from "../toast";

interface ChildRiskDashboardProps {
  onSelectChild?: (childName: string, balgruhaName: string) => void;
}

export default function ChildRiskDashboard({ onSelectChild }: ChildRiskDashboardProps) {
  const toast = useToast();
  const [data, setData] = useState<RiskDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quick Access Modal/Drawer state
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [updatingChildId, setUpdatingChildId] = useState<string | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRiskDashboard();
      setData(res);
    } catch (err: any) {
      setError(err?.message || "Failed to load risk dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleUpdateProfile = async (
    childId: string,
    updates: {
      risk_category?: string;
      needs_psychologist_review?: boolean;
      anger_increasing?: boolean;
    }
  ) => {
    setUpdatingChildId(childId);
    try {
      await updateChildRiskProfile(childId, updates);
      toast.success("Child profile risk status updated successfully!");
      // Reload dashboard to update counts and lists
      await loadDashboard();
    } catch (err: any) {
      toast.error("Failed to update profile: " + (err?.message || String(err)));
    } finally {
      setUpdatingChildId(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <div className="spinner" style={{ margin: "0 auto 16px" }} />
        <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
          Loading Child Risk Dashboard...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: "24px", textAlign: "center" }} className="card">
        <p style={{ color: "var(--accent-red)", marginBottom: "12px" }}>
          ⚠️ {error || "No dashboard data available"}
        </p>
        <button onClick={loadDashboard} className="btn btn-secondary">
          Retry Loading
        </button>
      </div>
    );
  }

  const { categories, psychologist_work_list, total_children } = data;

  const categoryConfigs: { key: keyof typeof categories; title: string; color: string; bg: string; icon: string }[] = [
    {
      key: "high_risk",
      title: "High Risk",
      color: "#dc2626",
      bg: "#fee2e2",
      icon: "🚨",
    },
    {
      key: "trauma_unprocessed",
      title: "Trauma is not yet processed",
      color: "#b45309",
      bg: "#fef3c7",
      icon: "💔",
    },
    {
      key: "identity_formation",
      title: "Identity formation process is going on",
      color: "#0369a1",
      bg: "#e0f2fe",
      icon: "🪞",
    },
  ];

  const activeCategoryDetail = selectedCategoryKey && categories[selectedCategoryKey as keyof typeof categories]
    ? categories[selectedCategoryKey as keyof typeof categories]
    : null;

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
          background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
          borderRadius: "16px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 700, color: "var(--md-sys-color-on-surface, #020617)" }}>
            🧠 Child Risk Dashboard
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--md-sys-color-on-surface-variant, #475569)" }}>
            Overview of child risk categorisation across {total_children} children in all Balgruhas
          </p>
        </div>

        {/* Overview Pills */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <div
            style={{
              padding: "6px 14px",
              borderRadius: "20px",
              background: "#dcfce7",
              border: "1px solid #86efac",
              fontSize: "0.82rem",
              color: "#15803d",
              fontWeight: 600,
            }}
          >
            🌱 Well Adjusted: <strong>{categories.well_adjusted?.count || 0}</strong>
          </div>
          <div
            style={{
              padding: "6px 14px",
              borderRadius: "20px",
              background: "#f1f5f9",
              border: "1px solid #cbd5e1",
              fontSize: "0.82rem",
              color: "#475569",
              fontWeight: 600,
            }}
          >
            📋 Not Yet Screened: <strong>{categories.not_yet_screened?.count || 0}</strong>
          </div>
        </div>
      </div>

      {/* 3 Primary Categories Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "18px" }}>
        {categoryConfigs.map((cfg) => {
          const detail = categories[cfg.key];
          const count = detail?.count || 0;
          const trend = detail?.trend || "stable";
          const trendIcon = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
          const trendColor = trend === "up" ? "#dc2626" : trend === "down" ? "#16a34a" : "#64748b";

          return (
            <div
              key={cfg.key}
              onClick={() => setSelectedCategoryKey(cfg.key)}
              style={{
                cursor: "pointer",
                padding: "20px",
                borderRadius: "16px",
                background: "#ffffff",
                border: `1px solid ${selectedCategoryKey === cfg.key ? cfg.color : "#e2e8f0"}`,
                boxShadow: selectedCategoryKey === cfg.key ? `0 0 12px ${cfg.color}22` : "0 1px 3px rgba(0,0,0,0.05)",
                transition: "all 0.2s ease",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
              className="hover-card"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "1.8rem" }}>{cfg.icon}</span>
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: "12px",
                    background: cfg.bg,
                    color: cfg.color,
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  Trend <strong style={{ color: trendColor, fontSize: "1.1rem" }}>{trendIcon}</strong>
                </span>
              </div>

              <div>
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "var(--md-sys-color-on-surface, #020617)" }}>
                  {cfg.title}
                </h3>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "8px" }}>
                  <span style={{ fontSize: "2.2rem", fontWeight: 800, color: cfg.color }}>{count}</span>
                  <span style={{ fontSize: "0.85rem", color: "var(--md-sys-color-on-surface-variant, #475569)" }}>children</span>
                </div>
              </div>

              <div
                style={{
                  marginTop: "auto",
                  paddingTop: "8px",
                  borderTop: "1px solid #f1f5f9",
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.8rem",
                  color: cfg.color,
                  fontWeight: 600,
                }}
              >
                <span>⚡ Click for Quick Access</span>
                <span>View list →</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Access Children Modal / Panel (when a category card is clicked) */}
      {selectedCategoryKey && activeCategoryDetail && (
        <div
          style={{
            padding: "20px",
            borderRadius: "16px",
            background: "#ffffff",
            border: "1px solid var(--md-sys-color-primary, #0369a1)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--md-sys-color-on-surface, #020617)" }}>
              ⚡ Quick Access: {activeCategoryDetail.label} ({activeCategoryDetail.children?.length || 0})
            </h3>
            <button
              onClick={() => setSelectedCategoryKey(null)}
              className="btn btn-secondary"
              style={{ padding: "4px 12px", fontSize: "0.8rem" }}
            >
              ✕ Close Quick Access
            </button>
          </div>

          {!activeCategoryDetail.children || activeCategoryDetail.children.length === 0 ? (
            <p style={{ color: "var(--md-sys-color-on-surface-variant, #475569)", fontSize: "0.9rem", fontStyle: "italic" }}>
              No children currently tagged under this category.
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: "14px" }}>
              {activeCategoryDetail.children.map((child) => (
                <div
                  key={child._id}
                  style={{
                    padding: "16px",
                    borderRadius: "12px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <h4
                        style={{
                          margin: 0,
                          fontSize: "1rem",
                          fontWeight: 700,
                          color: "var(--md-sys-color-primary, #0369a1)",
                          cursor: onSelectChild ? "pointer" : "default",
                        }}
                        onClick={() => onSelectChild && onSelectChild(child.child_name, child.balgruha_name)}
                      >
                        {child.child_name}
                      </h4>
                      <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--md-sys-color-on-surface-variant, #475569)" }}>
                        🏠 {child.balgruha_name}
                      </p>
                    </div>

                    {/* Last Session Date Badge */}
                    <div
                      style={{
                        padding: "4px 10px",
                        borderRadius: "8px",
                        background:
                          child.days_since_last_session === null || child.days_since_last_session > 30
                            ? "#fee2e2"
                            : child.days_since_last_session > 14
                            ? "#fef3c7"
                            : "#dcfce7",
                        color:
                          child.days_since_last_session === null || child.days_since_last_session > 30
                            ? "#dc2626"
                            : child.days_since_last_session > 14
                            ? "#b45309"
                            : "#15803d",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        textAlign: "right",
                      }}
                    >
                      📅 {child.days_since_last_session !== null ? `${child.days_since_last_session} days ago` : "No sessions"}
                    </div>
                  </div>

                  {/* Manual Profile Quick Controls */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexWrap: "wrap",
                      paddingTop: "8px",
                      borderTop: "1px solid #e2e8f0",
                    }}
                  >
                    <label style={{ fontSize: "0.75rem", color: "var(--md-sys-color-on-surface-variant, #475569)", fontWeight: 600 }}>
                      Risk Tag:
                    </label>
                    <select
                      value={child.risk_category}
                      disabled={updatingChildId === child._id}
                      onChange={(e) => handleUpdateProfile(child._id, { risk_category: e.target.value })}
                      style={{
                        padding: "4px 8px",
                        borderRadius: "6px",
                        background: "#ffffff",
                        border: "1px solid #cbd5e1",
                        color: "var(--md-sys-color-on-surface, #020617)",
                        fontSize: "0.78rem",
                        flex: 1,
                      }}
                    >
                      <option value="high_risk">🚨 High Risk</option>
                      <option value="trauma_unprocessed">💔 Trauma Unprocessed</option>
                      <option value="identity_formation">🪞 Identity Formation</option>
                      <option value="well_adjusted">🌱 Well Adjusted</option>
                      <option value="not_yet_screened">📋 Not Yet Screened</option>
                    </select>
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      disabled={updatingChildId === child._id}
                      onClick={() =>
                        handleUpdateProfile(child._id, {
                          needs_psychologist_review: !child.needs_psychologist_review,
                        })
                      }
                      style={{
                        padding: "4px 8px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        background: child.needs_psychologist_review ? "#f3e8ff" : "#ffffff",
                        color: child.needs_psychologist_review ? "#7e22ce" : "var(--md-sys-color-on-surface-variant)",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      {child.needs_psychologist_review ? "💜 Review Needed" : "+ Needs Review Tag"}
                    </button>

                    <button
                      disabled={updatingChildId === child._id}
                      onClick={() =>
                        handleUpdateProfile(child._id, {
                          anger_increasing: !child.anger_increasing,
                        })
                      }
                      style={{
                        padding: "4px 8px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        background: child.anger_increasing ? "#fee2e2" : "#ffffff",
                        color: child.anger_increasing ? "#dc2626" : "var(--md-sys-color-on-surface-variant)",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      {child.anger_increasing ? "🔥 Anger Increasing" : "+ Anger Tag"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Psychologist Work List View */}
      <div
        style={{
          padding: "24px",
          borderRadius: "16px",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--md-sys-color-on-surface, #020617)" }}>
              🩺 Psychologist Work List ({psychologist_work_list.length})
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--md-sys-color-on-surface-variant, #475569)" }}>
              Children requiring active psychologist review, anger tracking, or follow-up task resolution
            </p>
          </div>
        </div>

        {psychologist_work_list.length === 0 ? (
          <p style={{ color: "var(--md-sys-color-on-surface-variant, #475569)", textAlign: "center", padding: "20px", fontStyle: "italic" }}>
            🎉 All child follow-ups and psychologist reviews are up to date!
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0", color: "var(--md-sys-color-on-surface-variant, #475569)", background: "#f8fafc" }}>
                  <th style={{ padding: "10px 12px" }}>Child Name</th>
                  <th style={{ padding: "10px 12px" }}>Balgruha</th>
                  <th style={{ padding: "10px 12px" }}>Risk Category</th>
                  <th style={{ padding: "10px 12px" }}>Last Session</th>
                  <th style={{ padding: "10px 12px" }}>Review Tags</th>
                  <th style={{ padding: "10px 12px" }}>Pending Tasks</th>
                  <th style={{ padding: "10px 12px" }}>Manual Risk Action</th>
                </tr>
              </thead>
              <tbody>
                {psychologist_work_list.map((child) => (
                  <tr
                    key={child._id}
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      background: child.needs_psychologist_review ? "#faf5ff" : "transparent",
                    }}
                  >
                    <td style={{ padding: "12px" }}>
                      <span
                        style={{
                          fontWeight: 700,
                          color: "var(--md-sys-color-primary, #0369a1)",
                          cursor: onSelectChild ? "pointer" : "default",
                        }}
                        onClick={() => onSelectChild && onSelectChild(child.child_name, child.balgruha_name)}
                      >
                        {child.child_name}
                      </span>
                    </td>
                    <td style={{ padding: "12px", color: "var(--md-sys-color-on-surface-variant, #475569)" }}>{child.balgruha_name}</td>
                    <td style={{ padding: "12px" }}>
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: "6px",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          background:
                            child.risk_category === "high_risk"
                              ? "#fee2e2"
                              : child.risk_category === "trauma_unprocessed"
                              ? "#fef3c7"
                              : "#e0f2fe",
                          color:
                            child.risk_category === "high_risk"
                              ? "#dc2626"
                              : child.risk_category === "trauma_unprocessed"
                              ? "#b45309"
                              : "#0369a1",
                        }}
                      >
                        {child.raw_risk_category}
                      </span>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <span style={{ fontWeight: 600 }}>
                        {child.days_since_last_session !== null ? `${child.days_since_last_session} days ago` : "None"}
                      </span>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {child.needs_psychologist_review && (
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "12px",
                              background: "#f3e8ff",
                              color: "#7e22ce",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                            }}
                          >
                            💜 Needs Review
                          </span>
                        )}
                        {child.anger_increasing && (
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "12px",
                              background: "#fee2e2",
                              color: "#dc2626",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                            }}
                          >
                            🔥 Anger Increasing
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "12px" }}>
                      {child.pending_tasks_count > 0 ? (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "10px",
                            background: "#fef3c7",
                            color: "#b45309",
                            fontWeight: 700,
                            fontSize: "0.75rem",
                          }}
                        >
                          {child.pending_tasks_count} pending
                        </span>
                      ) : (
                        <span style={{ color: "var(--md-sys-color-on-surface-variant, #475569)", fontSize: "0.8rem" }}>0</span>
                      )}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <select
                        value={child.risk_category}
                        disabled={updatingChildId === child._id}
                        onChange={(e) => handleUpdateProfile(child._id, { risk_category: e.target.value })}
                        style={{
                          padding: "4px 8px",
                          borderRadius: "6px",
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          color: "var(--md-sys-color-on-surface, #020617)",
                          fontSize: "0.78rem",
                        }}
                      >
                        <option value="high_risk">🚨 High Risk</option>
                        <option value="trauma_unprocessed">💔 Trauma Unprocessed</option>
                        <option value="identity_formation">🪞 Identity Formation</option>
                        <option value="well_adjusted">🌱 Well Adjusted</option>
                        <option value="not_yet_screened">📋 Not Yet Screened</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
