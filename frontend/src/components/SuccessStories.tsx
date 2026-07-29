import { useState, useEffect } from "react";
import {
  fetchSuccessStories,
  type SuccessStoriesResponse,
} from "../api";

interface SuccessStoriesProps {
  onSelectChild?: (childName: string, balgruhaName: string) => void;
}

export default function SuccessStories({ onSelectChild }: SuccessStoriesProps) {
  const [data, setData] = useState<SuccessStoriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
                        cursor: onSelectChild ? "pointer" : "default",
                      }}
                      onClick={() => onSelectChild && onSelectChild(story.child_name, story.balgruha_name)}
                    >
                      {story.child_name}
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

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.78rem", color: "var(--md-sys-color-on-surface-variant, #475569)" }}>
                  <span>📋 {story.observations_count} sessions recorded</span>
                  <span>📅 Last: {story.last_observation_date}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
