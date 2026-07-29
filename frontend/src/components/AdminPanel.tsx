import { useState, useEffect, useCallback } from "react";
import {
  adminLogin,
  fetchAdminUnmatched,
  resolveAdminUnmatched,
  type AdminUnmatchedEntry,
  type AdminResolveRequest,
} from "../api";
import CollapsibleSection from "./CollapsibleSection";
import ChildRiskDashboard from "./ChildRiskDashboard";
import FallingThroughCracks from "./FallingThroughCracks";
import BalgruhaHeatMap from "./BalgruhaHeatMap";
import TaskAnalytics from "./TaskAnalytics";
import SuccessStories from "./SuccessStories";

const ADMIN_PASSWORD_KEY = "isf-admin-auth";
const SESSION_TIMEOUT = 4 * 60 * 60 * 1000; // 4 hours

interface AdminPanelProps {
  onClose?: () => void;
  onSelectChild?: (childName: string, balgruhaName: string) => void;
  onSelectCenter?: (centerName: string) => void;
}

const statusLabel: Record<string, string> = {
  pending: "Pending Review",
  created: "Created in DB",
  matched: "Matched to Existing",
  dismissed: "Dismissed",
};

const statusColor: Record<string, string> = {
  pending: "badge-warn",
  created: "badge-success",
  matched: "badge-info",
  dismissed: "badge-neutral",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdminPanel({ onClose, onSelectChild, onSelectCenter }: AdminPanelProps) {
  const [authed, setAuthed] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "risk-dashboard" | "falling-cracks" | "heatmap" | "task-analytics" | "success-stories" | "unmatched"
  >("risk-dashboard");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<AdminUnmatchedEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [statusFilter, setStatusFilter] = useState("");
  const [centerFilter, setCenterFilter] = useState("");
  const [centers, setCenters] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resolveDialog, setResolveDialog] = useState<{
    entry: AdminUnmatchedEntry;
    action: "create" | "match" | "dismiss";
  } | null>(null);
  const [resolveForm, setResolveForm] = useState<AdminResolveRequest>({
    action: "create",
    child_name: "",
    class_studying: "",
    dob: "",
    school: "",
    parent_status: "",
    languages: "",
    strengths: "",
    weakness: "",
    nature_behavior: "",
    matched_child_id: "",
    matched_child_name: "",
    notes: "",
  });
  const [resolveLoading, setResolveLoading] = useState(false);

  // Check existing session
  useEffect(() => {
    const session = sessionStorage.getItem(ADMIN_PASSWORD_KEY);
    if (session) {
      try {
        const { expiry } = JSON.parse(session);
        if (Date.now() < expiry) {
          setAuthed(true);
        } else {
          sessionStorage.removeItem(ADMIN_PASSWORD_KEY);
        }
      } catch {
        sessionStorage.removeItem(ADMIN_PASSWORD_KEY);
      }
    }
  }, []);

  // Logout handler
  const logout = () => {
    sessionStorage.removeItem(ADMIN_PASSWORD_KEY);
    setAuthed(false);
    setEntries([]);
    if (onClose) onClose();
  };

  // Login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoading(true);
    try {
      const res = await adminLogin(password);
      if (res.ok) {
        const expiry = Date.now() + SESSION_TIMEOUT;
        sessionStorage.setItem(
          ADMIN_PASSWORD_KEY,
          JSON.stringify({ token: res.token || "admin", expiry })
        );
        setAuthed(true);
        setPassword("");
        loadEntries();
      } else {
        setLoginError("Invalid admin password");
      }
    } catch (err: any) {
      if (err?.status === 403) {
        setLoginError("Invalid admin password");
      } else {
        setLoginError("Login failed. Check server connection.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Load entries
  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminUnmatched(
        statusFilter || undefined,
        centerFilter || undefined,
        page,
        pageSize,
      );
      setEntries(res.entries);
      setTotal(res.total);

      // Build centers list from entries
      const uniqueCenters = [...new Set(res.entries.map((e) => e.balgruha_name))].sort();
      if (uniqueCenters.length > 0) setCenters(uniqueCenters);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, centerFilter, page, pageSize]);

  useEffect(() => {
    if (authed) loadEntries();
  }, [authed, loadEntries]);

  // Handle page change
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  // Open resolve dialog
  const openResolve = (entry: AdminUnmatchedEntry, action: "create" | "match" | "dismiss") => {
    setResolveDialog({ entry, action });
    setResolveForm({
      action,
      child_name: entry.extracted_name,
      class_studying: "",
      dob: "",
      school: "",
      parent_status: "",
      languages: "",
      strengths: "",
      weakness: "",
      nature_behavior: "",
      matched_child_id: "",
      matched_child_name: "",
      notes: "",
    });
  };

  // Handle resolve submit
  const handleResolve = async () => {
    if (!resolveDialog) return;
    setResolveLoading(true);
    try {
      const res = await resolveAdminUnmatched(resolveDialog.entry._id, resolveForm);
      // Update local entry
      setEntries((prev) =>
        prev.map((e) => (e._id === res._id ? res : e))
      );
      setResolveDialog(null);
    } catch (e) {
      alert("Failed to resolve: " + String(e));
    } finally {
      setResolveLoading(false);
    }
  };

  // Handle form changes
  const handleResolveChange = (field: string, value: string) => {
    setResolveForm((prev) => ({ ...prev, [field]: value }));
  };

  // Match existing child - we need to fetch candidates
  const [matchCandidates, setMatchCandidates] = useState<
    { child_name: string; db_id: string; class_studying?: string }[]
  >([]);
  const [matchSearch, setMatchSearch] = useState("");

  useEffect(() => {
    if (!resolveDialog || resolveDialog.action !== "match" || !matchSearch.trim()) {
      setMatchCandidates([]);
      return;
    }
    // Simple debounce could be added here
    const timeout = setTimeout(async () => {
      try {
        // We'll just use a simple fetch - the search endpoint requires center name
        if (resolveDialog.entry.balgruha_name) {
          const { searchChildren } = await import("../api");
          const candidates = await searchChildren(
            resolveDialog.entry.balgruha_name,
            matchSearch
          );
          setMatchCandidates(candidates);
        }
      } catch {
        setMatchCandidates([]);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [matchSearch, resolveDialog]);

  // Select match candidate
  const selectMatch = (cand: { child_name: string; db_id: string; class_studying?: string }) => {
    setResolveForm((prev) => ({
      ...prev,
      matched_child_id: cand.db_id,
      matched_child_name: cand.child_name,
    }));
    setMatchSearch(cand.child_name);
    setMatchCandidates([]);
  };

  if (!authed) {
    return (
      <div className="admin-login glass page-pad" style={{ maxWidth: 400, margin: "60px auto" }}>
        <h2 style={{ textAlign: "center", marginBottom: 24 }}>
          <span className="msym" style={{ fontSize: 32 }}>admin_panel_settings</span>
          <br />
          Admin Panel
        </h2>
        <p className="muted" style={{ textAlign: "center", marginBottom: 24 }}>
          Enter admin password to access unmatched children queue
        </p>
        {loginError && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            <span className="msym">error</span> {loginError}
          </div>
        )}
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              autoFocus
              disabled={loading}
            />
          </div>
          <button className="btn btn-primary btn-block grow" type="submit" disabled={loading}>
            {loading ? (
              <>
                <span className="spin msym" style={{ fontSize: 16, marginRight: 8 }}>
                  progress_activity
                </span>
                Signing in…
              </>
            ) : (
              <>
                <span className="msym" style={{ marginRight: 8 }}>login</span>
                Sign In
              </>
            )}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="admin-panel glass page-pad">
      {/* Top Header & Tabs */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 16,
          borderBottom: "1px solid #e2e8f0",
          paddingBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--md-sys-color-on-surface, #020617)" }}>
            <span className="msym" style={{ marginRight: 8, color: "var(--md-sys-color-primary, #0369a1)" }}>admin_panel_settings</span>
            POC Admin Panel
          </h2>
          <div style={{ display: "flex", gap: 6, background: "#f1f5f9", padding: "4px", borderRadius: "10px", border: "1px solid #e2e8f0", flexWrap: "wrap" }}>
            <button
              onClick={() => setActiveTab("risk-dashboard")}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === "risk-dashboard" ? "var(--md-sys-color-primary, #0369a1)" : "transparent",
                color: activeTab === "risk-dashboard" ? "#fff" : "var(--md-sys-color-on-surface-variant, #475569)",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              🧠 Child Risk
            </button>
            <button
              onClick={() => setActiveTab("falling-cracks")}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === "falling-cracks" ? "var(--md-sys-color-primary, #0369a1)" : "transparent",
                color: activeTab === "falling-cracks" ? "#fff" : "var(--md-sys-color-on-surface-variant, #475569)",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              🚨 Falling Cracks
            </button>
            <button
              onClick={() => setActiveTab("heatmap")}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === "heatmap" ? "var(--md-sys-color-primary, #0369a1)" : "transparent",
                color: activeTab === "heatmap" ? "#fff" : "var(--md-sys-color-on-surface-variant, #475569)",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              🗺️ Risk Heat Map
            </button>
            <button
              onClick={() => setActiveTab("task-analytics")}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === "task-analytics" ? "var(--md-sys-color-primary, #0369a1)" : "transparent",
                color: activeTab === "task-analytics" ? "#fff" : "var(--md-sys-color-on-surface-variant, #475569)",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              📊 Task Analytics
            </button>
            <button
              onClick={() => setActiveTab("success-stories")}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === "success-stories" ? "var(--md-sys-color-primary, #0369a1)" : "transparent",
                color: activeTab === "success-stories" ? "#fff" : "var(--md-sys-color-on-surface-variant, #475569)",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              🏆 Recovery Stories
            </button>
            <button
              onClick={() => setActiveTab("unmatched")}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === "unmatched" ? "var(--md-sys-color-primary, #0369a1)" : "transparent",
                color: activeTab === "unmatched" ? "#fff" : "var(--md-sys-color-on-surface-variant, #475569)",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              📋 Unmatched ({total})
            </button>
          </div>
        </div>

        <button className="btn btn-outline" onClick={logout}>
          <span className="msym" style={{ marginRight: 6 }}>logout</span>
          Sign Out
        </button>
      </div>

      {activeTab === "risk-dashboard" && (
        <ChildRiskDashboard onSelectChild={onSelectChild} />
      )}

      {activeTab === "falling-cracks" && (
        <FallingThroughCracks onSelectChild={onSelectChild} />
      )}

      {activeTab === "heatmap" && (
        <BalgruhaHeatMap onSelectCenter={onSelectCenter} />
      )}

      {activeTab === "task-analytics" && (
        <TaskAnalytics onSelectChild={onSelectChild} />
      )}

      {activeTab === "success-stories" && (
        <SuccessStories onSelectChild={onSelectChild} />
      )}


      {activeTab === "unmatched" && (
        <>
          {/* Filters */}
      <div className="row-wrap gap-12" style={{ marginBottom: 20, flexWrap: "wrap" }}>
        <div className="form-group" style={{ minWidth: 200 }}>
          <label>Status</label>
          <select
            className="form-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="created">Created</option>
            <option value="matched">Matched</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
        <div className="form-group" style={{ minWidth: 200 }}>
          <label>Center / Balgruha</label>
          <select
            className="form-select"
            value={centerFilter}
            onChange={(e) => {
              setCenterFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Centers</option>
            {centers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <span className="msym">error</span> {error}
        </div>
      )}

      {/* Table */}
      {loading && entries.length === 0 ? (
        <div className="spinner-overlay" style={{ padding: 40 }}>
          <div className="spin-ring" />
          <p className="muted">Loading queue…</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="alert alert-info" style={{ textAlign: "center", padding: 40 }}>
          <span className="msym" style={{ fontSize: 48 }}>inbox</span>
          <p style={{ marginTop: 12 }}>No unmatched children found</p>
        </div>
      ) : (
        <>
          <div className="table-wrapper" style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Child Name</th>
                  <th>Center</th>
                  <th>Report</th>
                  <th>Date</th>
                  <th>Coaches</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th style={{ width: 180 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry._id}>
                    <td>
                      <strong>{entry.extracted_name}</strong>
                    </td>
                    <td>{entry.balgruha_name}</td>
                    <td style={{ maxWidth: 200, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                      {entry.report_title || "Untitled"}
                    </td>
                    <td>{entry.report_date ? formatDate(entry.report_date) : "—"}</td>
                    <td style={{ maxWidth: 150, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                      {entry.coaches?.join(", ") || "—"}
                    </td>
                    <td>
                      <span className={`badge ${statusColor[entry.status]}`}>
                        {statusLabel[entry.status] || entry.status}
                      </span>
                    </td>
                    <td>{formatDate(entry.created_at)}</td>
                    <td>
                      <div className="row gap-8" style={{ flexWrap: "wrap" }}>
                        {entry.status === "pending" && (
                          <>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => openResolve(entry, "create")}
                            >
                              <span className="msym" style={{ marginRight: 4 }}>person_add</span>
                              Create
                            </button>
                            <button
                              className="btn btn-tonal btn-sm"
                              onClick={() => openResolve(entry, "match")}
                            >
                              <span className="msym" style={{ marginRight: 4 }}>link</span>
                              Match
                            </button>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => openResolve(entry, "dismiss")}
                            >
                              <span className="msym" style={{ marginRight: 4 }}>cancel</span>
                              Dismiss
                            </button>
                          </>
                        )}
                        {entry.status !== "pending" && (
                          <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
                            {entry.resolution?.action || entry.status}
                            {entry.resolution?.child_id && (
                              <> · <span className="msym" style={{ fontSize: 12 }}>check_circle</span></>
                            )}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > pageSize && (
            <div className="row" style={{ justifyContent: "center", marginTop: 16, gap: 8 }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
              >
                <span className="msym">chevron_left</span> Prev
              </button>
              <span style={{ alignSelf: "center", minWidth: 60, textAlign: "center" }}>
                Page {page} of {Math.ceil(total / pageSize)}
              </span>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= Math.ceil(total / pageSize)}
              >
                Next <span className="msym">chevron_right</span>
              </button>
            </div>
          )}
        </>
      )}
    </>
  )}

      {/* Resolve Dialog — rendered outside tab conditional so it overlays correctly */}
      {activeTab === "unmatched" && resolveDialog && (
        <div className="dialog-overlay" onClick={() => setResolveDialog(null)}>
          <div
            className="dialog glass"
            style={{ maxWidth: 600, width: "90%", maxHeight: "85vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-header">
              <h3 style={{ margin: 0 }}>
                <span
                  className="msym"
                  style={{
                    marginRight: 8,
                    color:
                      resolveDialog.action === "create"
                        ? "var(--md-sys-color-primary)"
                        : resolveDialog.action === "match"
                        ? "var(--md-sys-color-tertiary)"
                        : "var(--md-sys-color-error)",
                  }}
                >
                  {resolveDialog.action === "create"
                    ? "person_add"
                    : resolveDialog.action === "match"
                    ? "link"
                    : "cancel"}
                </span>
                {resolveDialog.action.charAt(0).toUpperCase() + resolveDialog.action.slice(1)} Child
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setResolveDialog(null)}>
                <span className="msym">close</span>
              </button>
            </div>

            <div className="dialog-body">
              <p className="muted" style={{ marginBottom: 16 }}>
                Extracted name: <strong>{resolveDialog.entry.extracted_name}</strong> ·
                Center: <strong>{resolveDialog.entry.balgruha_name}</strong> ·
                Report: {resolveDialog.entry.report_title}
              </p>

              <div style={{ marginBottom: 20 }}>
                <CollapsibleSection title="View Extracted Report Details" icon="description">
                  <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>
                    {resolveDialog.entry.generalBackground && (
                      <p style={{ marginTop: 0 }}><strong>Background:</strong><br />{resolveDialog.entry.generalBackground}</p>
                    )}
                    {resolveDialog.entry.psychologicalNotes && (
                      <p><strong>Psychological Notes:</strong><br />{resolveDialog.entry.psychologicalNotes}</p>
                    )}
                    {resolveDialog.entry.observations && (
                      <p><strong>Observations:</strong><br />{resolveDialog.entry.observations}</p>
                    )}
                    {resolveDialog.entry.actionItems && resolveDialog.entry.actionItems.length > 0 && (
                      <div>
                        <strong>Action Items:</strong>
                        <ul style={{ margin: "4px 0 0 20px", padding: 0 }}>
                          {resolveDialog.entry.actionItems.map((a, idx) => (
                            <li key={idx}>{a}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(!resolveDialog.entry.generalBackground && !resolveDialog.entry.psychologicalNotes && !resolveDialog.entry.observations && (!resolveDialog.entry.actionItems || resolveDialog.entry.actionItems.length === 0)) && (
                      <p className="muted">No details were extracted for this child in the report.</p>
                    )}
                  </div>
                </CollapsibleSection>
              </div>

              {resolveDialog.action === "create" && (
                <>
                  <div className="form-group">
                    <label>Child Name <span style={{ color: "var(--md-sys-color-error)" }}>*</span></label>
                    <input
                      className="form-input"
                      value={resolveForm.child_name || ""}
                      onChange={(e) => handleResolveChange("child_name", e.target.value)}
                      placeholder="Full name as it should appear"
                    />
                  </div>
                  <div className="row-wrap gap-12" style={{ marginBottom: 12 }}>
                    <div className="form-group grow" style={{ minWidth: 180 }}>
                      <label>Class Studying</label>
                      <input className="form-input" value={resolveForm.class_studying || ""} onChange={(e) => handleResolveChange("class_studying", e.target.value)} placeholder="e.g. 5th Standard" />
                    </div>
                    <div className="form-group grow" style={{ minWidth: 180 }}>
                      <label>Date of Birth</label>
                      <input type="date" className="form-input" value={resolveForm.dob || ""} onChange={(e) => handleResolveChange("dob", e.target.value)} />
                    </div>
                    <div className="form-group grow" style={{ minWidth: 180 }}>
                      <label>School</label>
                      <input className="form-input" value={resolveForm.school || ""} onChange={(e) => handleResolveChange("school", e.target.value)} placeholder="School name" />
                    </div>
                  </div>
                  <div className="row-wrap gap-12" style={{ marginBottom: 12 }}>
                    <div className="form-group grow" style={{ minWidth: 180 }}>
                      <label>Parent Status</label>
                      <input className="form-input" value={resolveForm.parent_status || ""} onChange={(e) => handleResolveChange("parent_status", e.target.value)} placeholder="e.g. Single Parent, Orphan" />
                    </div>
                    <div className="form-group grow" style={{ minWidth: 180 }}>
                      <label>Languages</label>
                      <input className="form-input" value={resolveForm.languages || ""} onChange={(e) => handleResolveChange("languages", e.target.value)} placeholder="e.g. Marathi, Hindi" />
                    </div>
                  </div>
                  <div className="row-wrap gap-12" style={{ marginBottom: 12 }}>
                    <div className="form-group grow" style={{ minWidth: 180 }}>
                      <label>Strengths</label>
                      <input className="form-input" value={resolveForm.strengths || ""} onChange={(e) => handleResolveChange("strengths", e.target.value)} placeholder="e.g. Drawing, Mathematics" />
                    </div>
                    <div className="form-group grow" style={{ minWidth: 180 }}>
                      <label>Weaknesses</label>
                      <input className="form-input" value={resolveForm.weakness || ""} onChange={(e) => handleResolveChange("weakness", e.target.value)} placeholder="e.g. Stage fear" />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 16 }}>
                    <label>Nature / Behavior Notes</label>
                    <textarea className="form-textarea" rows={3} value={resolveForm.nature_behavior || ""} onChange={(e) => handleResolveChange("nature_behavior", e.target.value)} placeholder="e.g. Quiet, friendly, anxious around new people…" />
                  </div>
                </>
              )}

              {resolveDialog.action === "match" && (
                <div>
                  <p className="muted" style={{ marginBottom: 12 }}>
                    Search for existing child in <strong>{resolveDialog.entry.balgruha_name}</strong>
                  </p>
                  <div className="form-group">
                    <label>Search by name</label>
                    <input className="form-input" value={matchSearch} onChange={(e) => setMatchSearch(e.target.value)} placeholder="Type to search existing children…" />
                  </div>
                  {matchCandidates.length > 0 && (
                    <div className="candidates-section" style={{ marginTop: 8 }}>
                      <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>Matching Children</h4>
                      {matchCandidates.map((cand) => (
                        <div key={cand.db_id} className="row" style={{ alignItems: "center", gap: 10, marginBottom: 8, padding: 8, background: "var(--md-sys-color-surface-container-highest)", borderRadius: 8, cursor: "pointer" }} onClick={() => selectMatch(cand)}>
                          <span style={{ flex: 1 }}>
                            <strong>{cand.child_name}</strong>
                            <span className="badge badge-info" style={{ marginLeft: 8, fontSize: 11 }}>{cand.class_studying || "No class"}</span>
                          </span>
                          <span className="msym" style={{ color: "var(--md-sys-color-primary)" }}>chevron_right</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {matchSearch && matchCandidates.length === 0 && !loading && (
                    <p className="muted" style={{ marginTop: 8 }}>No matches found. Try a different spelling or create new.</p>
                  )}
                  {resolveForm.matched_child_name && (
                    <div className="alert alert-success" style={{ marginTop: 12 }}>
                      <span className="msym">check_circle</span> Selected: <strong>{resolveForm.matched_child_name}</strong>
                    </div>
                  )}
                </div>
              )}

              {resolveDialog.action === "dismiss" && (
                <div>
                  <p className="muted" style={{ marginBottom: 12 }}>
                    Dismiss this entry. It will be marked as dismissed and hidden from the pending queue.
                  </p>
                  <div className="form-group">
                    <label>Notes (optional)</label>
                    <textarea className="form-textarea" rows={3} value={resolveForm.notes || ""} onChange={(e) => handleResolveChange("notes", e.target.value)} placeholder="Reason for dismissal…" />
                  </div>
                </div>
              )}
            </div>

            <div className="dialog-footer" style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-sm" onClick={() => setResolveDialog(null)}>Cancel</button>
              <button
                className={resolveDialog.action === "dismiss" ? "btn btn-danger btn-sm" : "btn btn-primary btn-sm"}
                onClick={handleResolve}
                disabled={resolveLoading || (resolveDialog.action === "create" && !resolveForm.child_name?.trim()) || (resolveDialog.action === "match" && !resolveForm.matched_child_id)}
              >
                {resolveLoading ? (
                  <>
                    <span className="spin msym" style={{ fontSize: 16, marginRight: 6 }}>progress_activity</span>
                    Saving…
                  </>
                ) : (
                  resolveDialog.action === "dismiss" ? "Dismiss" : resolveDialog.action === "match" ? "Match & Save" : "Create & Save"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}