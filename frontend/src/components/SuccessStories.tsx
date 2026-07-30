import { useState, useEffect } from "react";
import {
  fetchSuccessStories,
  fetchChild,
  fetchObservations,
  type SuccessStoriesResponse,
  type SuccessStoryChild,
  type ChildDoc,
  type Observation,
} from "../api";
import ProfileCard from "./ProfileCard";
import CollapsibleSection from "./CollapsibleSection";

function fmtDate(d: string | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d.slice(0, 10);
  }
}

interface SuccessStoriesProps {
  onSelectChild?: (childName: string, balgruhaName: string) => void;
}

export default function SuccessStories({ onSelectChild }: SuccessStoriesProps) {
  const [data, setData] = useState<SuccessStoriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Popup Modal State
  const [selectedStory, setSelectedStory] = useState<SuccessStoryChild | null>(null);
  const [childDoc, setChildDoc] = useState<ChildDoc | null>(null);
  const [obsHistory, setObsHistory] = useState<Observation[]>([]);
  const [docLoading, setDocLoading] = useState(false);

  const handleOpenModal = async (story: SuccessStoryChild) => {
    setSelectedStory(story);
    setDocLoading(true);
    try {
      const [doc, obs] = await Promise.all([
        fetchChild(story._id),
        fetchObservations(story._id),
      ]);
      setChildDoc(doc);
      setObsHistory(obs);
    } catch {
      setChildDoc({
        _id: story._id,
        child_name: story.child_name,
        balgruha_name: story.balgruha_name,
        photo_url: story.photo_url,
        strengths: story.strengths,
        nature_behavior: story.nature_behavior,
      } as ChildDoc);
      setObsHistory([]);
    } finally {
      setDocLoading(false);
    }
  };

  const handleCloseModal = () => {
    setSelectedStory(null);
    setChildDoc(null);
    setObsHistory([]);
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSuccessStories();
      setData(res);
    } catch (err: any) {
      setError(err?.message || "Failed to load success stories");
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
          Loading child recovery stories and positive progress records...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: "24px", textAlign: "center" }} className="card">
        <p style={{ color: "var(--accent-red)", marginBottom: "12px" }}>
          ⚠️ {error || "Failed to load recovery stories"}
        </p>
        <button onClick={loadData} className="btn btn-secondary">
          Retry Loading
        </button>
      </div>
    );
  }

  const { metrics, success_stories } = data;

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
          padding: "24px",
          background: "linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)",
          borderRadius: "16px",
          border: "1px solid #bbf7d0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700, color: "var(--md-sys-color-on-surface, #020617)" }}>
            🏆 Success Stories &amp; Child Recovery Page
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "0.88rem", color: "var(--md-sys-color-on-surface-variant, #475569)" }}>
            Celebrating positive recoveries, emotional stability, and successful transitions to "Well Adjusted"
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ padding: "8px 16px", borderRadius: "20px", background: "#dcfce7", color: "#15803d", fontWeight: 700, fontSize: "0.85rem" }}>
            ✨ {metrics.recovered_this_month} Children Recovered
          </div>
          <div style={{ padding: "8px 16px", borderRadius: "20px", background: "#e0f2fe", color: "#0369a1", fontWeight: 700, fontSize: "0.85rem" }}>
            📉 {metrics.reduction_text}
          </div>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
        <div style={{ padding: "20px", borderRadius: "14px", background: "#ffffff", border: "1px solid #86efac", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.82rem", color: "var(--md-sys-color-on-surface-variant, #475569)", fontWeight: 600 }}>Total Well Adjusted Children</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#16a34a", marginTop: "6px" }}>{metrics.well_adjusted_total}</div>
          <p style={{ margin: "4px 0 0", fontSize: "0.78rem", color: "var(--md-sys-color-on-surface-variant, #475569)" }}>Out of {metrics.total_children} registered children</p>
        </div>

        <div style={{ padding: "20px", borderRadius: "14px", background: "#ffffff", border: "1px solid #7dd3fc", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.82rem", color: "var(--md-sys-color-on-surface-variant, #475569)", fontWeight: 600 }}>High Risk Reduction</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#0284c7", marginTop: "6px" }}>{metrics.high_risk_reduced_from} → {metrics.high_risk_reduced_to}</div>
          <p style={{ margin: "4px 0 0", fontSize: "0.78rem", color: "var(--md-sys-color-on-surface-variant, #475569)" }}>Significant decrease in acute cases</p>
        </div>
      </div>

      {/* Recovery Cards List */}
      <div>
        <h3 style={{ margin: "0 0 16px", fontSize: "1.1rem", fontWeight: 700, color: "var(--md-sys-color-on-surface, #020617)" }}>
          🌱 Recovered Children &amp; Positive Case Milestones ({success_stories.length})
        </h3>

        {success_stories.length === 0 ? (
          <p style={{ padding: "24px", textAlign: "center", color: "var(--md-sys-color-on-surface-variant, #475569)", fontStyle: "italic" }}>
            No children tagged as "Well Adjusted" yet.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "18px" }}>
            {success_stories.map((story) => (
              <div
                key={story._id}
                style={{
                  padding: "20px",
                  borderRadius: "16px",
                  background: "#ffffff",
                  border: "1px solid #86efac",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  transition: "transform 0.15s ease, box-shadow 0.15s ease",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h4
                      style={{
                        margin: 0,
                        fontSize: "1.1rem",
                        fontWeight: 700,
                        color: "var(--md-sys-color-primary, #0369a1)",
                        cursor: "pointer",
                        textDecoration: "underline",
                        textUnderlineOffset: "3px",
                      }}
                      onClick={() => handleOpenModal(story)}
                      title="Click to view full roster card & reports"
                    >
                      {story.child_name} ↗
                    </h4>
                    <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "var(--md-sys-color-on-surface-variant, #475569)" }}>
                      🏠 {story.balgruha_name}
                    </p>
                  </div>

                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: "12px",
                      background: "#dcfce7",
                      color: "#15803d",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                    }}
                  >
                    🌱 Well Adjusted
                  </span>
                </div>

                <div style={{ fontSize: "0.82rem", color: "var(--md-sys-color-on-surface-variant, #475569)", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div><strong>💪 Key Strengths:</strong> {story.strengths}</div>
                  <div><strong>😊 Behavior:</strong> {story.nature_behavior}</div>
                </div>

                <div
                  style={{
                    padding: "12px",
                    borderRadius: "10px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    fontSize: "0.82rem",
                    lineHeight: "1.5",
                    color: "#334155",
                    fontStyle: "italic",
                  }}
                >
                  "{story.summary}"
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.78rem", color: "var(--md-sys-color-on-surface-variant, #475569)", paddingTop: "4px", borderTop: "1px dashed #e2e8f0" }}>
                  <span>📋 {story.observations_count} sessions</span>
                  <button
                    type="button"
                    className="btn btn-tonal btn-sm"
                    style={{ fontSize: "0.75rem", padding: "3px 10px" }}
                    onClick={() => handleOpenModal(story)}
                  >
                    <span className="msym" style={{ fontSize: "14px" }}>badge</span> View Roster &amp; Reports
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Roster Profile Card Popup Modal */}
      {selectedStory && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={handleCloseModal}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "20px",
              maxWidth: "680px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              border: "1px solid var(--md-sys-color-outline-variant, #e2e8f0)",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="msym" style={{ color: "#16a34a", fontSize: "24px" }}>verified</span>
                <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "var(--md-sys-color-on-surface, #020617)" }}>
                  Child Roster Card &amp; Observations
                </h3>
              </div>
              <button
                onClick={handleCloseModal}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "20px",
                  color: "var(--md-sys-color-on-surface-variant, #64748b)",
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderRadius: "6px",
                }}
                title="Close modal"
              >
                ✕
              </button>
            </div>

            {/* ProfileCard Component */}
            {docLoading ? (
              <div style={{ padding: "32px", textAlign: "center" }}>
                <div className="spinner" style={{ margin: "0 auto 12px" }} />
                <p style={{ color: "var(--md-sys-color-on-surface-variant, #64748b)", fontSize: "0.9rem" }}>
                  Loading {selectedStory.child_name}'s full profile and observation reports...
                </p>
              </div>
            ) : (
              <>
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
                  <ProfileCard
                    doc={childDoc || ({
                      _id: selectedStory._id,
                      child_name: selectedStory.child_name,
                      balgruha_name: selectedStory.balgruha_name,
                      photo_url: selectedStory.photo_url,
                      strengths: selectedStory.strengths,
                      nature_behavior: selectedStory.nature_behavior,
                    } as ChildDoc)}
                    hideBadge
                  />
                </div>

                {/* Milestone Summary */}
                <div style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)", border: "1px solid #bbf7d0", padding: "16px", borderRadius: "12px" }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: "0.92rem", fontWeight: 700, color: "#15803d", display: "flex", alignItems: "center", gap: "6px" }}>
                    🌱 Recovery Milestone Summary
                  </h4>
                  <p style={{ margin: 0, fontSize: "0.85rem", lineHeight: "1.55", color: "#334155", fontStyle: "italic" }}>
                    "{selectedStory.summary}"
                  </p>
                </div>

                {/* Previously Recorded Reports & Observations */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <h4 style={{ margin: "0 0 4px", fontSize: "0.95rem", fontWeight: 700, color: "var(--md-sys-color-on-surface, #020617)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span className="msym" style={{ color: "var(--md-sys-color-primary, #0369a1)" }}>description</span>
                    Previously Recorded Reports &amp; Observations ({obsHistory.length})
                  </h4>

                  {obsHistory.length === 0 ? (
                    <div style={{ padding: "14px", borderRadius: "10px", background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: "0.82rem", color: "#64748b", fontStyle: "italic", textAlign: "center" }}>
                      No observation reports recorded for this child.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {obsHistory.map((obs, idx) => {
                        const coaches = Array.isArray(obs.coachesInvolved)
                          ? obs.coachesInvolved.join(", ")
                          : obs.coachesInvolved ?? "";

                        return (
                          <CollapsibleSection
                            key={idx}
                            title={fmtDate(obs.date)}
                            subtitle={obs.reportTitle ?? "Untitled Report"}
                            icon="description"
                            defaultOpen={idx === 0}
                          >
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.82rem", lineHeight: "1.5" }}>
                              {obs.psychologistName && (
                                <div>
                                  <strong>🩺 Psychologist / Assessor:</strong> {obs.psychologistName}
                                </div>
                              )}
                              {coaches && (
                                <div>
                                  <strong>👥 Coaches Involved:</strong> {coaches}
                                </div>
                              )}
                              {obs.centerName && (
                                <div>
                                  <strong>🏠 Center:</strong> {obs.centerName}
                                </div>
                              )}
                              {obs.generalBackground && (
                                <div>
                                  <strong>📋 General Background:</strong>
                                  <p style={{ margin: "2px 0 0", color: "#334155" }}>{obs.generalBackground}</p>
                                </div>
                              )}
                              {(obs.psychologicalNotes || obs.observations) && (
                                <div>
                                  <strong>🧠 Psychological &amp; Behavioral Observations:</strong>
                                  <p style={{ margin: "2px 0 0", color: "#334155", background: "#ffffff", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                                    {obs.psychologicalNotes || obs.observations}
                                  </p>
                                </div>
                              )}
                              {obs.followUp && (
                                <div>
                                  <strong>🔄 Follow Up:</strong>
                                  <p style={{ margin: "2px 0 0", color: "#334155" }}>{obs.followUp}</p>
                                </div>
                              )}
                              {obs.actionItems && obs.actionItems.length > 0 && (
                                <div>
                                  <strong>🎯 Action Items / Follow-up Tasks:</strong>
                                  <ul style={{ margin: "2px 0 0", paddingLeft: "18px", color: "#334155" }}>
                                    {obs.actionItems.map((item, iIdx) => (
                                      <li key={iIdx}>{item}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </CollapsibleSection>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", paddingTop: "8px", borderTop: "1px solid #f1f5f9" }}>
              {onSelectChild && (
                <button
                  className="btn btn-primary"
                  style={{ fontSize: "0.85rem", padding: "8px 16px" }}
                  onClick={() => {
                    const name = selectedStory.child_name;
                    const bname = selectedStory.balgruha_name;
                    handleCloseModal();
                    onSelectChild(name, bname);
                  }}
                >
                  <span className="msym">open_in_new</span> Open in Directory
                </button>
              )}
              <button
                className="btn btn-outline"
                style={{ fontSize: "0.85rem", padding: "8px 16px" }}
                onClick={handleCloseModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

