import { useState, useEffect } from "react";
import {
  rematchChild,
  confirmMatch,
  saveObservations,
  createChild,
  fetchCenters,
  ApiError,
  type MatchedChild,
  type SaveResult,
  type Center,
} from "../api";
import ProfileCard from "./ProfileCard";

interface Meta {
  centerName: string;
  centerId: string;
  reportTitle: string;
  reportDate: string;
  coaches: string[];
  rawReport?: string;
}

interface Props {
  initial: MatchedChild[];
  meta: Meta;
  mongoDown?: boolean;
  onBack: () => void;
  onSaved: (results: SaveResult[], meta: Meta, children: MatchedChild[]) => void;
}

export default function ReviewProfiles({ initial, meta, mongoDown, onBack, onSaved }: Props) {
  const [children, setChildren] = useState<MatchedChild[]>(() =>
    initial.map((c) => ({ ...c })),
  );

  // Per-child editable observation fields
  const [obs, setObs] = useState(() =>
    initial.map((c) => ({
      name: c.name ?? "",
      bg: c.generalBackground ?? "",
      psychologistName: c.psychologistName ?? "",
      testsDone: c.testsDone ?? "",
      observations: c.observations ?? "",
      followUp: c.followUp ?? "",
      psych: c.psychologicalNotes ?? "",
      actions: (c.actionItems ?? []).join("\n"),
      category: c.risk_category ?? "",
    })),
  );

  // Per-card expand state
  const [expanded, setExpanded] = useState<boolean[]>(() =>
    initial.map(() => true),
  );

  // Per-card create form state
  const [showCreateForm, setShowCreateForm] = useState<boolean[]>(() =>
    initial.map(() => false),
  );

  // Input states for new child profiles per card
  const [newChildData, setNewChildData] = useState<Record<number, {
    child_name: string;
    class_studying: string;
    dob: string;
    school: string;
    parent_status: string;
    languages: string;
    strengths: string;
    weakness: string;
    nature_behavior: string;
  }>>({});

  // Per-card loading state for re-match / confirm
  const [cardLoading, setCardLoading] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the backend rejects the save as a duplicate (HTTP 409).
  const [dupWarning, setDupWarning] = useState<string | null>(null);

  // Editable report metadata states
  const [reportTitle, setReportTitle] = useState(meta.reportTitle);
  const [reportDate, setReportDate] = useState(meta.reportDate);
  const [coachesRaw, setCoachesRaw] = useState(meta.coaches.join(", "));
  const [selectedCenter, setSelectedCenter] = useState(meta.centerName);
  const [centers, setCenters] = useState<Center[]>([]);
  const [aiDetectedCenter, setAiDetectedCenter] = useState("");

  useEffect(() => {
    fetchCenters()
      .then((c) => {
        setCenters(c);
        // Auto-select the best-matching center from the AI-extracted name
        if (meta.centerName) {
          const exactMatch = c.find(
            (center) => center.name.toLowerCase() === meta.centerName.toLowerCase()
          );
          if (exactMatch) {
            setSelectedCenter(exactMatch.name);
            setAiDetectedCenter(exactMatch.name);
            return;
          }
          // Fuzzy-ish: find a center whose name contains or is contained by the AI name
          const partialMatch = c.find(
            (center) =>
              center.name.toLowerCase().includes(meta.centerName.toLowerCase()) ||
              meta.centerName.toLowerCase().includes(center.name.toLowerCase())
          );
          if (partialMatch) {
            setSelectedCenter(partialMatch.name);
            setAiDetectedCenter(partialMatch.name);
          } else {
            // Still set the raw AI name and show it; user must confirm
            setAiDetectedCenter(meta.centerName);
          }
        }
      })
      .catch(() => setCenters([]));
  }, []);

  const handleCenterChange = async (newCenter: string) => {
    setSelectedCenter(newCenter);
    const updatedChildren = [...children];
    for (let i = 0; i < updatedChildren.length; i++) {
      const name = obs[i].name.trim();
      if (!name) continue;
      try {
        const res = await rematchChild({ name, center_name: newCenter });
        if (res.entry) {
          updatedChildren[i] = { ...updatedChildren[i], ...res.entry };
        } else {
          updatedChildren[i] = {
            ...updatedChildren[i],
            matched: false,
            match_type: "none",
            match_score: 0,
            db_id: undefined,
            db_name: undefined,
            profile: {},
            candidates: [],
          };
        }
      } catch (e) {
        console.error("Fuzzy rematching during center change failed:", e);
      }
    }
    setChildren(updatedChildren);
  };

  const nMatched = children.filter((c) => c.matched).length;
  const nUnmatched = children.length - nMatched;

  const updateObs = (i: number, field: string, value: string) => {
    setObs((prev) => {
      const copy = [...prev];
      copy[i] = { ...copy[i], [field]: value };
      return copy;
    });
  };

  const toggleExpand = (i: number) =>
    setExpanded((prev) => {
      const copy = [...prev];
      copy[i] = !copy[i];
      return copy;
    });

  const handleDelete = (i: number) => {
    setChildren((prev) => prev.filter((_, idx) => idx !== i));
    setObs((prev) => prev.filter((_, idx) => idx !== i));
    setExpanded((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleRematch = async (i: number) => {
    const name = obs[i].name.trim();
    if (!name) return;
    setCardLoading(i);
    try {
      const res = await rematchChild({ name, center_name: selectedCenter });
      if (res.entry) {
        setChildren((prev) => {
          const copy = [...prev];
          copy[i] = { ...copy[i], ...res.entry! };
          return copy;
        });
      } else {
        setError(`No match found for "${name}". Try a different spelling.`);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setCardLoading(null);
    }
  };

  const handleConfirm = async (i: number, cand: { db_id: string; child_name: string; score: number }) => {
    setCardLoading(i);
    try {
      const res = await confirmMatch({
        db_id: cand.db_id,
        name: children[i].name,
        score: cand.score,
      });
      if (res.entry) {
        setChildren((prev) => {
          const copy = [...prev];
          copy[i] = { ...copy[i], ...res.entry };
          return copy;
        });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setCardLoading(null);
    }
  };

  const handleOpenCreateForm = (i: number) => {
    setNewChildData((prev) => ({
      ...prev,
      [i]: {
        child_name: obs[i].name,
        class_studying: "",
        dob: "",
        school: "",
        parent_status: "",
        languages: "",
        strengths: "",
        weakness: "",
        nature_behavior: "",
      }
    }));
    setShowCreateForm((prev) => {
      const copy = [...prev];
      copy[i] = true;
      return copy;
    });
  };

  const updateNewChildField = (i: number, field: string, value: string) => {
    setNewChildData((prev) => ({
      ...prev,
      [i]: {
        ...prev[i],
        [field]: value
      }
    }));
  };

  const handleCreateChild = async (i: number) => {
    const data = newChildData[i];
    if (!data || !data.child_name.trim()) {
      setError("Child name is required to create a profile.");
      return;
    }
    setCardLoading(i);
    setError(null);
    try {
      const res = await createChild({
        child_name: data.child_name.trim(),
        balgruha_name: selectedCenter,
        class_studying: data.class_studying,
        dob: data.dob,
        school: data.school,
        parent_status: data.parent_status,
        languages: data.languages,
        strengths: data.strengths,
        weakness: data.weakness,
        nature_behavior: data.nature_behavior,
        extracted_name: children[i].name,
      });

      if (res.entry) {
        setChildren((prev) => {
          const copy = [...prev];
          copy[i] = { ...copy[i], ...res.entry };
          return copy;
        });
        // Update editable observation name
        setObs((prev) => {
          const copy = [...prev];
          copy[i] = { ...copy[i], name: res.entry.name };
          return copy;
        });
        setShowCreateForm((prev) => {
          const copy = [...prev];
          copy[i] = false;
          return copy;
        });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setCardLoading(null);
    }
  };

  const handleSave = async (force = false) => {
    if (saving) return; // guard against double-clicks / rapid re-entry
    setSaving(true);
    setError(null);
    setDupWarning(null);
    try {
      const updatedChildren: MatchedChild[] = children.map((c, i) => ({
        ...c,
        name: obs[i].name,
        generalBackground: obs[i].bg,
        psychologistName: obs[i].psychologistName,
        testsDone: obs[i].testsDone,
        observations: obs[i].observations,
        followUp: obs[i].followUp,
        psychologicalNotes: obs[i].psych,
        actionItems: obs[i].actions
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        risk_category: obs[i].category || undefined,
      }));

      const coaches = coachesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const selectedCenterId =
        centers.find((c) => c.name === selectedCenter)?.id ?? meta.centerId;

      const updatedMeta = {
        centerName: selectedCenter,
        centerId: selectedCenterId,
        reportTitle,
        reportDate,
        coaches,
        rawReport: meta.rawReport,
      };

      const res = await saveObservations({
        report_title: reportTitle,
        report_date: reportDate,
        coaches,
        center_id: selectedCenterId,
        center_name: selectedCenter,
        matched_children: updatedChildren,
        raw_report: meta.rawReport ?? "",
        force,
      });

      onSaved(res.save_results, updatedMeta, updatedChildren);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // Duplicate report — let the user decide instead of failing silently.
        setDupWarning(e.message);
      } else {
        setError(String(e));
      }
      setSaving(false);
    }
  };

  if (saving) {
    return (
      <div className="spinner-overlay">
        <div className="spin-ring" />
        <h3>Saving observations to MongoDB…</h3>
      </div>
    );
  }

  return (
    <>
      <h2 className="section-heading" style={{ marginBottom: 24 }}>
        <span className="msym">visibility</span>
        Review Extracted Profiles
      </h2>

      {/* Editable Metadata Section */}
      <div className="glass" style={{ padding: 20, borderRadius: 12, marginBottom: 24, border: "1px solid var(--md-sys-color-outline-variant)" }}>
        <h3 className="section-heading" style={{ marginTop: 0, marginBottom: 16 }}>
          <span className="msym">edit_calendar</span> Edit Report Metadata
        </h3>
        <div className="row-wrap gap-16">
          <div className="form-group grow" style={{ minWidth: 200 }}>
            <label htmlFor="review-center" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Center / Balgruha
              {aiDetectedCenter && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 7px",
                  borderRadius: 20,
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  color: "#fff",
                  letterSpacing: 0.4,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                }}>
                  ✦ AI Auto-detected
                </span>
              )}
            </label>
            <select
              id="review-center"
              className="form-select"
              value={selectedCenter}
              onChange={(e) => { setAiDetectedCenter(""); handleCenterChange(e.target.value); }}
            >
              <option value="">— Select Center —</option>
              {centers.map((c: any) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group grow" style={{ minWidth: 200 }}>
            <label htmlFor="review-title">Report Title</label>
            <input
              id="review-title"
              className="form-input"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
            />
          </div>
          <div className="form-group grow" style={{ minWidth: 150 }}>
            <label htmlFor="review-date">Report Date</label>
            <input
              id="review-date"
              className="form-input"
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
            />
          </div>
          <div className="form-group grow" style={{ minWidth: 200 }}>
            <label htmlFor="review-coaches">Coaches Involved</label>
            <input
              id="review-coaches"
              className="form-input"
              value={coachesRaw}
              onChange={(e) => setCoachesRaw(e.target.value)}
            />
          </div>
        </div>
      </div>

      {nUnmatched > 0 && (
        <div className="alert alert-warn" style={{ marginBottom: 24 }}>
          <span className="msym">warning</span>
          <strong>{nUnmatched} child(ren) not found</strong> in{" "}
          <strong>{selectedCenter || "selected center"}</strong>. Correct the name, select a
          suggestion, or save to forward them to the Admin.
        </div>
      )}


      {/* Metrics */}
      <div className="metrics-row">
        <div className="metric glass">
          <div className="metric-value">{children.length}</div>
          <div className="metric-label">
            <span className="msym">group</span> Children Found
          </div>
        </div>
        <div className="metric glass">
          <div className="metric-value">{nMatched}</div>
          <div className="metric-label">
            <span className="msym">check_circle</span> Matched
          </div>
        </div>
        <div className="metric glass">
          <div className="metric-value">{nUnmatched}</div>
          <div className="metric-label">
            <span className="msym">cancel</span> Unmatched
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span className="msym">error</span> {error}
        </div>
      )}
      {dupWarning && (
        <div className="alert alert-warn" role="alertdialog">
          <span className="msym">content_copy</span>
          <div style={{ flex: 1 }}>
            <strong>Duplicate report detected.</strong> {dupWarning}
            <div className="row gap-12" style={{ marginTop: 10 }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setDupWarning(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleSave(true)}
              >
                <span className="msym" style={{ fontSize: 18 }}>warning</span>
                Save anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile cards */}
      {children.map((child, i) => (
        <div className="expand-card" key={i}>
          {/* Header */}
          <div className="expand-header" onClick={() => toggleExpand(i)}>
            {child.matched ? (
              <span className="match-badge match-exact">
                <span className="msym">check_circle</span>Matched
              </span>
            ) : (
              <span className="match-badge match-none">
                <span className="msym">cancel</span>Unmatched
              </span>
            )}
            <span>{child.name}</span>
            <span
              className={`msym chevron ${expanded[i] ? "open" : ""}`}
              aria-label={expanded[i] ? "Collapse profile" : "Expand profile"}
            >
              expand_more
            </span>
          </div>

          {expanded[i] && (
            <div className="expand-body">
              {/* Badge + delete */}
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <ProfileCard matched={child} />
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(i)}
                >
                  <span className="msym" style={{ fontSize: 18 }}>delete</span>
                  Delete
                </button>
              </div>

              {/* Unmatched: candidate suggestions + manual re-match */}
              {!child.matched && (
                <>
                  {child.candidates && child.candidates.length > 0 && (
                    <div className="candidates-section">
                      <h4>
                        <span className="msym">lightbulb</span> Suggested Matches from DB
                      </h4>
                      {child.candidates.map((cand) => (
                        <div
                          key={cand.db_id}
                          className="row"
                          style={{
                            alignItems: "center",
                            gap: 10,
                            marginBottom: 8,
                          }}
                        >
                          <span style={{ flex: 1, fontSize: 14 }}>
                            {cand.child_name}{" "}
                            <span className="badge badge-info">
                              {cand.score}%
                            </span>
                          </span>
                          <button
                            className="btn btn-tonal btn-sm"
                            disabled={cardLoading === i}
                            onClick={() => handleConfirm(i, cand)}
                            aria-label={`Confirm match for ${cand.child_name}`}
                          >
                            <span className="msym">link</span> Confirm
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div
                    className="row gap-12"
                    style={{ marginTop: 14, alignItems: "flex-end" }}
                  >
                    <div className="form-group grow">
                      <label><span className="msym">edit</span> Search manually</label>
                      <input
                        className="form-input"
                        placeholder="Type exact name from MongoDB…"
                        value={obs[i].name}
                        onChange={(e) => updateObs(i, "name", e.target.value)}
                      />
                    </div>
                    <button
                      className="btn btn-outline btn-sm"
                      disabled={cardLoading === i}
                      onClick={() => handleRematch(i)}
                    >
                      {cardLoading === i ? (
                        <span className="spin msym" style={{ fontSize: 16 }}>progress_activity</span>
                      ) : (
                        <><span className="msym">autorenew</span> Re-match</>
                      )}
                    </button>
                  </div>

                  {!showCreateForm[i] ? (
                    <div className="row gap-12" style={{ marginTop: 14 }}>
                      <button
                        className="btn btn-tonal btn-sm grow"
                        disabled={cardLoading === i}
                        onClick={() => handleOpenCreateForm(i)}
                      >
                        <span className="msym">person_add</span>
                        Create New Child Profile
                      </button>
                    </div>
                  ) : (
                    <>
                    <h4 style={{ display: "flex", alignItems: "center", gap: 6, margin: "14px 0 0" }}>
                      <span className="msym" aria-hidden="true">person_add</span>
                      Create Profile for {obs[i].name}
                    </h4>
                    <div className="edit-obs-form">
                      <div className="edit-form-grid">
                        <div className="form-group">
                          <label>Full Name</label>
                          <input
                            className="form-input"
                            value={newChildData[i]?.child_name || ""}
                            onChange={(e) => updateNewChildField(i, "child_name", e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Center (Read-only)</label>
                          <input
                            className="form-input"
                            value={meta.centerName}
                            disabled
                          />
                        </div>
                      </div>
                      <div className="edit-form-grid">
                        <div className="form-group">
                          <label>Class Studying</label>
                          <input
                            className="form-input"
                            placeholder="e.g. 5th Standard"
                            value={newChildData[i]?.class_studying || ""}
                            onChange={(e) => updateNewChildField(i, "class_studying", e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Date of Birth</label>
                          <input
                            className="form-input"
                            type="date"
                            value={newChildData[i]?.dob || ""}
                            onChange={(e) => updateNewChildField(i, "dob", e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>School</label>
                          <input
                            className="form-input"
                            placeholder="e.g. School Name"
                            value={newChildData[i]?.school || ""}
                            onChange={(e) => updateNewChildField(i, "school", e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="edit-form-grid">
                        <div className="form-group">
                          <label>Parent Status</label>
                          <input
                            className="form-input"
                            placeholder="e.g. Single Parent, Orphan"
                            value={newChildData[i]?.parent_status || ""}
                            onChange={(e) => updateNewChildField(i, "parent_status", e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Languages Spoken</label>
                          <input
                            className="form-input"
                            placeholder="e.g. Marathi, Hindi"
                            value={newChildData[i]?.languages || ""}
                            onChange={(e) => updateNewChildField(i, "languages", e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="edit-form-grid">
                        <div className="form-group">
                          <label>Strengths</label>
                          <input
                            className="form-input"
                            placeholder="e.g. Drawing, Mathematics"
                            value={newChildData[i]?.strengths || ""}
                            onChange={(e) => updateNewChildField(i, "strengths", e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Weaknesses</label>
                          <input
                            className="form-input"
                            placeholder="e.g. Stage fear"
                            value={newChildData[i]?.weakness || ""}
                            onChange={(e) => updateNewChildField(i, "weakness", e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="edit-form-grid">
                        <div className="form-group">
                          <label>Nature / Behavior Notes</label>
                          <textarea
                            className="form-textarea"
                            rows={2}
                            placeholder="e.g. Quiet, friendly..."
                            value={newChildData[i]?.nature_behavior || ""}
                            onChange={(e) => updateNewChildField(i, "nature_behavior", e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="edit-form-actions">
                        <button
                          className="btn btn-outline btn-sm"
                          disabled={cardLoading === i}
                          onClick={() => {
                            setShowCreateForm((prev) => {
                              const copy = [...prev];
                              copy[i] = false;
                              return copy;
                            });
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={cardLoading === i}
                          onClick={() => handleCreateChild(i)}
                        >
                          {cardLoading === i ? (
                            <span className="spin msym" style={{ fontSize: 16 }}>progress_activity</span>
                          ) : (
                            "Save Profile & Match"
                          )}
                        </button>
                      </div>
                    </div>
                    </>
                  )}
                </>
              )}

              <hr className="card-divider" />

              {/* Observation fields */}
              <p className="section-label">Observation from this Report</p>
              <div className="obs-grid">
                {/* Category Dropdown */}
                <div className="form-group obs-full">
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="msym" aria-hidden="true">category</span>
                    Category
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 20,
                      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                      color: "#fff",
                      letterSpacing: 0.4,
                    }}>
                      Select applicable
                    </span>
                  </label>
                  <select
                    id={`obs-category-${i}`}
                    className="form-select"
                    value={obs[i].category}
                    onChange={(e) => updateObs(i, "category", e.target.value)}
                    style={{
                      borderRadius: 10,
                      border: obs[i].category
                        ? "2px solid var(--md-sys-color-primary, #6366f1)"
                        : "1px solid var(--md-sys-color-outline-variant)",
                      background: obs[i].category ? "rgba(99,102,241,0.06)" : undefined,
                      fontWeight: obs[i].category ? 600 : undefined,
                      transition: "border 0.2s, background 0.2s",
                    }}
                  >
                    <option value="">— No observation / Not selected —</option>
                    <option value="high_risk">🚨 High Risk</option>
                    <option value="identity_formation">🪞 Identity Formation Stage</option>
                    <option value="well_adjusted">🌱 Well Adjusted</option>
                    <option value="trauma_unprocessed">💔 Trauma Being Processed</option>
                    <option value="not_yet_screened">📋 No Observation</option>
                  </select>
                  {obs[i].category && (
                    <div style={{
                      marginTop: 6,
                      padding: "6px 12px",
                      borderRadius: 8,
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background:
                        obs[i].category === "high_risk" ? "#fee2e2" :
                        obs[i].category === "trauma_unprocessed" ? "#fef3c7" :
                        obs[i].category === "identity_formation" ? "#e0f2fe" :
                        obs[i].category === "well_adjusted" ? "#dcfce7" : "#f1f5f9",
                      color:
                        obs[i].category === "high_risk" ? "#dc2626" :
                        obs[i].category === "trauma_unprocessed" ? "#b45309" :
                        obs[i].category === "identity_formation" ? "#0369a1" :
                        obs[i].category === "well_adjusted" ? "#15803d" : "#475569",
                    }}>
                      {
                        obs[i].category === "high_risk" ? "🚨 High Risk" :
                        obs[i].category === "trauma_unprocessed" ? "💔 Trauma Being Processed" :
                        obs[i].category === "identity_formation" ? "🪞 Identity Formation Stage" :
                        obs[i].category === "well_adjusted" ? "🌱 Well Adjusted" : "📋 No Observation"
                      }
                    </div>
                  )}
                </div>

                <div className="form-group obs-full">
                  <label><span className="msym" aria-hidden="true">assignment</span> General Background</label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    value={obs[i].bg}
                    onChange={(e) => updateObs(i, "bg", e.target.value)}
                    placeholder="Family context, socioeconomic situation…"
                  />
                </div>
                <div className="form-group">
                  <label><span className="msym" aria-hidden="true">person</span> Psychologist Name</label>
                  <input
                    className="form-input"
                    value={obs[i].psychologistName}
                    onChange={(e) => updateObs(i, "psychologistName", e.target.value)}
                    placeholder="Name of psychologist…"
                  />
                </div>
                <div className="form-group">
                  <label><span className="msym" aria-hidden="true">science</span> Tests Done</label>
                  <input
                    className="form-input"
                    value={obs[i].testsDone}
                    onChange={(e) => updateObs(i, "testsDone", e.target.value)}
                    placeholder="e.g. Draw-A-Person test, block design…"
                  />
                </div>
                <div className="form-group obs-full">
                  <label><span className="msym" aria-hidden="true">visibility</span> Observations</label>
                  <textarea
                    className="form-textarea"
                    rows={4}
                    value={obs[i].observations}
                    onChange={(e) => {
                      updateObs(i, "observations", e.target.value);
                      updateObs(i, "psych", e.target.value); // Sync to psych fallback
                    }}
                    placeholder="Detailed behavioral and psychological observations…"
                  />
                </div>
                <div className="form-group obs-full">
                  <label><span className="msym" aria-hidden="true">autorenew</span> Follow up from previous observation</label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    value={obs[i].followUp}
                    onChange={(e) => updateObs(i, "followUp", e.target.value)}
                    placeholder="Follow up details and progress from previous sessions…"
                  />
                </div>
                <div className="form-group obs-full">
                  <label><span className="msym" aria-hidden="true">task_alt</span> Action Items (one per line)</label>
                  <textarea
                    className="form-textarea"
                    rows={4}
                    value={obs[i].actions}
                    onChange={(e) => updateObs(i, "actions", e.target.value)}
                    placeholder="Enter each follow-up action on a separate line"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Bottom action row */}
      <hr className="card-divider" />
      <div className="row gap-12">
        <button className="btn btn-outline" onClick={onBack}>
          <span className="msym" aria-hidden="true">arrow_back</span> Back
        </button>
        <button
          className="btn btn-primary btn-block grow"
          disabled={children.length === 0 || mongoDown || saving}
          onClick={() => handleSave()}
          title={
            mongoDown
              ? "MongoDB is offline — saving is disabled."
              : children.length === 0
                ? "No children to save."
                : ""
          }
        >
          <span className="msym">save</span>
          Save All Observations to Child Profiles
        </button>
      </div>
    </>
  );
}
