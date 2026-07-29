import { useState, useEffect } from "react";
import {
  fetchBalgruhaHeatmap,
  type BalgruhaHeatmapResponse,
  type BalgruhaHeatmapRow,
} from "../api";

interface BalgruhaHeatMapProps {
  onSelectCenter?: (balgruhaName: string) => void;
}

export default function BalgruhaHeatMap({ onSelectCenter }: BalgruhaHeatMapProps) {
  const [data, setData] = useState<BalgruhaHeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<keyof BalgruhaHeatmapRow>("high_risk");
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchBalgruhaHeatmap();
      setData(res);
    } catch (err: any) {
      setError(err?.message || "Failed to load heat map");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSort = (field: keyof BalgruhaHeatmapRow) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <div className="spinner" style={{ margin: "0 auto 16px" }} />
        <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
          Generating Risk Heat Map across all Balgruhas...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: "24px", textAlign: "center" }} className="card">
        <p style={{ color: "var(--accent-red)", marginBottom: "12px" }}>
          ⚠️ {error || "Failed to load heat map data"}
        </p>
        <button onClick={loadData} className="btn btn-secondary">
          Retry Loading
        </button>
      </div>
    );
  }

  const { summary, heatmap } = data;

  const sortedMap = [...heatmap].sort((a, b) => {
    const valA = a[sortField];
    const valB = b[sortField];
    if (typeof valA === "number" && typeof valB === "number") {
      return sortAsc ? valA - valB : valB - valA;
    }
    return sortAsc
      ? String(valA).localeCompare(String(valB))
      : String(valB).localeCompare(String(valA));
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header Banner */}
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
            🗺️ Risk Heat Map of All Balgruhas
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--md-sys-color-on-surface-variant, #475569)" }}>
            Side-by-side risk category distribution across {summary.total_balgruhas} Balgruhas ({summary.total_children} total children)
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div style={{ padding: "6px 14px", borderRadius: "20px", background: "#fee2e2", color: "#dc2626", fontWeight: 700, fontSize: "0.82rem" }}>
            🔥 Highest Risk: {summary.highest_risk_balgruha}
          </div>
        </div>
      </div>

      {/* Heat Map Table */}
      <div
        style={{
          borderRadius: "16px",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "var(--md-sys-color-on-surface-variant, #475569)" }}>
                <th
                  onClick={() => handleSort("balgruha_name")}
                  style={{ padding: "14px 16px", cursor: "pointer", fontWeight: 700 }}
                >
                  Balgruh Name {sortField === "balgruha_name" ? (sortAsc ? "↑" : "↓") : ""}
                </th>
                <th
                  onClick={() => handleSort("high_risk")}
                  style={{ padding: "14px 16px", cursor: "pointer", color: "#dc2626", fontWeight: 700, textAlign: "center" }}
                >
                  🚨 High Risk {sortField === "high_risk" ? (sortAsc ? "↑" : "↓") : ""}
                </th>
                <th
                  onClick={() => handleSort("trauma_unprocessed")}
                  style={{ padding: "14px 16px", cursor: "pointer", color: "#b45309", fontWeight: 700, textAlign: "center" }}
                >
                  💔 Trauma {sortField === "trauma_unprocessed" ? (sortAsc ? "↑" : "↓") : ""}
                </th>
                <th
                  onClick={() => handleSort("identity_formation")}
                  style={{ padding: "14px 16px", cursor: "pointer", color: "#0369a1", fontWeight: 700, textAlign: "center" }}
                >
                  🪞 Identity {sortField === "identity_formation" ? (sortAsc ? "↑" : "↓") : ""}
                </th>
                <th
                  onClick={() => handleSort("not_yet_screened")}
                  style={{ padding: "14px 16px", cursor: "pointer", color: "#475569", fontWeight: 700, textAlign: "center" }}
                >
                  📋 Not Yet Screened {sortField === "not_yet_screened" ? (sortAsc ? "↑" : "↓") : ""}
                </th>
                <th
                  onClick={() => handleSort("well_adjusted")}
                  style={{ padding: "14px 16px", cursor: "pointer", color: "#15803d", fontWeight: 700, textAlign: "center" }}
                >
                  🌱 Well Adjusted {sortField === "well_adjusted" ? (sortAsc ? "↑" : "↓") : ""}
                </th>
                <th
                  onClick={() => handleSort("total_children")}
                  style={{ padding: "14px 16px", cursor: "pointer", fontWeight: 700, textAlign: "center" }}
                >
                  Total Children {sortField === "total_children" ? (sortAsc ? "↑" : "↓") : ""}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedMap.map((row, idx) => (
                <tr
                  key={idx}
                  style={{
                    borderBottom: "1px solid #f1f5f9",
                    transition: "background 0.15s ease",
                  }}
                  className="hover-row"
                >
                  <td style={{ padding: "14px 16px" }}>
                    <span
                      style={{
                        fontWeight: 700,
                        color: "var(--md-sys-color-primary, #0369a1)",
                        cursor: onSelectCenter ? "pointer" : "default",
                      }}
                      onClick={() => onSelectCenter && onSelectCenter(row.balgruha_name)}
                    >
                      🏠 {row.balgruha_name}
                    </span>
                  </td>

                  {/* High Risk Cell */}
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <div
                      style={{
                        padding: "6px 12px",
                        borderRadius: "8px",
                        background: row.high_risk > 0 ? "#fee2e2" : "transparent",
                        color: row.high_risk > 0 ? "#dc2626" : "var(--md-sys-color-on-surface-variant, #475569)",
                        fontWeight: row.high_risk > 0 ? 800 : 400,
                        display: "inline-block",
                        minWidth: "36px",
                      }}
                    >
                      {row.high_risk}
                    </div>
                  </td>

                  {/* Trauma Cell */}
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <div
                      style={{
                        padding: "6px 12px",
                        borderRadius: "8px",
                        background: row.trauma_unprocessed > 0 ? "#fef3c7" : "transparent",
                        color: row.trauma_unprocessed > 0 ? "#b45309" : "var(--md-sys-color-on-surface-variant, #475569)",
                        fontWeight: row.trauma_unprocessed > 0 ? 800 : 400,
                        display: "inline-block",
                        minWidth: "36px",
                      }}
                    >
                      {row.trauma_unprocessed}
                    </div>
                  </td>

                  {/* Identity Cell */}
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <div
                      style={{
                        padding: "6px 12px",
                        borderRadius: "8px",
                        background: row.identity_formation > 0 ? "#e0f2fe" : "transparent",
                        color: row.identity_formation > 0 ? "#0369a1" : "var(--md-sys-color-on-surface-variant, #475569)",
                        fontWeight: row.identity_formation > 0 ? 800 : 400,
                        display: "inline-block",
                        minWidth: "36px",
                      }}
                    >
                      {row.identity_formation}
                    </div>
                  </td>

                  {/* Not Yet Screened Cell */}
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <div
                      style={{
                        padding: "6px 12px",
                        borderRadius: "8px",
                        background: row.not_yet_screened > 0 ? "#f1f5f9" : "transparent",
                        color: row.not_yet_screened > 0 ? "#475569" : "var(--md-sys-color-on-surface-variant, #475569)",
                        fontWeight: row.not_yet_screened > 0 ? 700 : 400,
                        display: "inline-block",
                        minWidth: "36px",
                      }}
                    >
                      {row.not_yet_screened}
                    </div>
                  </td>

                  {/* Well Adjusted Cell */}
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <div
                      style={{
                        padding: "6px 12px",
                        borderRadius: "8px",
                        background: row.well_adjusted > 0 ? "#dcfce7" : "transparent",
                        color: row.well_adjusted > 0 ? "#15803d" : "var(--md-sys-color-on-surface-variant, #475569)",
                        fontWeight: row.well_adjusted > 0 ? 800 : 400,
                        display: "inline-block",
                        minWidth: "36px",
                      }}
                    >
                      {row.well_adjusted}
                    </div>
                  </td>

                  {/* Total */}
                  <td style={{ padding: "14px 16px", textAlign: "center", fontWeight: 700 }}>
                    {row.total_children}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
