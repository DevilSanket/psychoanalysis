import type { SaveResult, MatchedChild } from "../api";

interface Meta {
  centerName: string;
  reportTitle: string;
  reportDate: string;
  coaches: string[];
}

interface Props {
  results: SaveResult[];
  meta: Meta;
  children: MatchedChild[];
  onReset: () => void;
}

function downloadBlob(data: string, filename: string, mime: string) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SaveComplete({ results, meta, children, onReset }: Props) {
  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);

  const exportData = {
    report_title: meta.reportTitle,
    report_date: meta.reportDate,
    selected_center_name: meta.centerName,
    coaches: meta.coaches,
    observations: children.map((c) => ({
      name: c.name,
      db_name: c.db_name,
      generalBackground: c.generalBackground,
      psychologicalNotes: c.psychologicalNotes,
      actionItems: c.actionItems,
      matched: c.matched,
    })),
  };

  const handleExportJSON = () => {
    const json = JSON.stringify(exportData, null, 2);
    const fname = `${meta.reportTitle.replace(/\s+/g, "_")}_observations.json`;
    downloadBlob(json, fname, "application/json");
  };

  const handleExportCSV = () => {
    const header =
      "Child Name,DB Name,General Background,Psychological Notes,Action Items,Matched in DB\n";
    const rows = exportData.observations
      .map((o) => {
        const actions = Array.isArray(o.actionItems)
          ? o.actionItems.join("; ")
          : o.actionItems ?? "";
        return [
          `"${o.name ?? ""}"`,
          `"${o.db_name ?? ""}"`,
          `"${(o.generalBackground ?? "").replace(/"/g, '""')}"`,
          `"${(o.psychologicalNotes ?? "").replace(/"/g, '""')}"`,
          `"${actions.replace(/"/g, '""')}"`,
          o.matched ? "Yes" : "No",
        ].join(",");
      })
      .join("\n");
    const fname = `${meta.reportTitle.replace(/\s+/g, "_")}_observations.csv`;
    downloadBlob(header + rows, fname, "text/csv");
  };

  return (
    <div className="done-section">
      <div className="check-circle">
        <span className="msym" aria-hidden="true">check_circle</span>
      </div>
      <h2>Observations Saved</h2>

      <div
        className="alert alert-info"
        style={{ maxWidth: 540, margin: "20px auto", textAlign: "left" }}
      >
        <div>
          <strong>Center:</strong> {meta.centerName}
          <br />
          <strong>Report:</strong> {meta.reportTitle}
          <br />
          <strong>Date:</strong> {meta.reportDate}
          <br />
          <strong>Coaches:</strong> {meta.coaches.join(", ") || "—"}
        </div>
      </div>

      {successes.length > 0 && (
        <div
          className="alert alert-success"
          style={{ maxWidth: 540, margin: "0 auto 14px", textAlign: "left" }}
        >
          <span className="msym" aria-hidden="true">celebration</span> Saved
          observations for{" "}
          <strong>{successes.length}</strong> child profile(s)
        </div>
      )}
      {successes.length > 0 && (
        <ul className="done-results">
          {successes.map((r) => (
            <li key={r.name}>
              <span className="msym" aria-hidden="true">check_circle</span>{" "}
              <strong>{r.name}</strong>
            </li>
          ))}
        </ul>
      )}

      {failures.length > 0 && (
        <>
          <div
            className="alert alert-error"
            style={{ maxWidth: 540, margin: "14px auto", textAlign: "left" }}
          >
            <span className="msym" aria-hidden="true">warning</span>{" "}
            {failures.length} record(s) could not be saved
          </div>
          <ul className="done-results">
            {failures.map((r) => (
              <li key={r.name}>
                <span className="msym" aria-hidden="true">cancel</span>{" "}
                <strong>{r.name}</strong> — {r.reason ?? "unknown error"}
              </li>
            ))}
          </ul>
        </>
      )}

      <hr className="card-divider" style={{ maxWidth: 540, margin: "24px auto" }} />

      <h3 className="section-heading" style={{ justifyContent: "center" }}>
        <span className="msym">download</span> Export Observations Report
      </h3>

      <div className="export-row" style={{ justifyContent: "center" }}>
        <button className="btn btn-tonal" onClick={handleExportJSON}>
          <span className="msym" aria-hidden="true">download</span> Export JSON
        </button>
        <button className="btn btn-tonal" onClick={handleExportCSV}>
          <span className="msym" aria-hidden="true">download</span> Export CSV
        </button>
      </div>

      <hr className="card-divider" style={{ maxWidth: 540, margin: "24px auto" }} />

      <button className="btn btn-primary" onClick={onReset}>
        <span className="msym">edit_note</span>
        Process Another Report
      </button>
    </div>
  );
}
