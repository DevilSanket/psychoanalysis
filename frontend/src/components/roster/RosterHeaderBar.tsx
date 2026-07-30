import type { Center, RosterStats } from "../../api";

export interface RosterHeaderBarProps {
  centers: Center[];
  selectedCenter: string;
  onSelectCenter: (centerName: string) => void;
  stats: RosterStats | null;
  loading: boolean;
  search: string;
  onSearchChange: (q: string) => void;
  sortBy: "name" | "observations";
  onSortByChange: (sort: "name" | "observations") => void;
}

export default function RosterHeaderBar({
  centers,
  selectedCenter,
  onSelectCenter,
  stats,
  loading,
  search,
  onSearchChange,
  sortBy,
  onSortByChange,
}: RosterHeaderBarProps) {
  return (
    <div className="roster-header-bar" style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--md-sys-color-on-surface, #0f172a)" }}>
            Select Center:
          </label>
          <select
            className="input-select"
            value={selectedCenter}
            onChange={(e) => onSelectCenter(e.target.value)}
            style={{ padding: "8px 14px", borderRadius: 8, fontSize: "0.9rem", minWidth: 200 }}
          >
            {centers.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          {loading && <span className="spin msym" style={{ color: "var(--md-sys-color-primary, #0369a1)" }}>progress_activity</span>}
        </div>

        {stats && (
          <div style={{ display: "flex", gap: 16, fontSize: "0.85rem" }}>
            <span className="badge badge-info" style={{ padding: "6px 12px", borderRadius: 20 }}>
              👶 {stats.total_children} Children
            </span>
            <span className="badge badge-success" style={{ padding: "6px 12px", borderRadius: 20 }}>
              📋 {stats.total_observations} Observations
            </span>
            <span className="badge badge-warning" style={{ padding: "6px 12px", borderRadius: 20 }}>
              👥 {stats.active_coaches} Active Coaches
            </span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <span className="msym" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#64748b" }}>
            search
          </span>
          <input
            type="text"
            className="input-text"
            placeholder="Search by child name..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{ width: "100%", paddingLeft: 38, paddingRight: 12, paddingTop: 8, paddingBottom: 8, borderRadius: 8 }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: "0.85rem", color: "#64748b" }}>Sort by:</label>
          <select
            className="input-select"
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as "name" | "observations")}
            style={{ padding: "6px 12px", borderRadius: 8, fontSize: "0.85rem" }}
          >
            <option value="name">Child Name</option>
            <option value="observations">Observation Count</option>
          </select>
        </div>
      </div>
    </div>
  );
}
