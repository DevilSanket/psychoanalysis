import { useState, useEffect, useMemo } from "react";
import {
  fetchCenters,
  fetchRoster,
  fetchChild,
  fetchObservations,
  deleteObservation,
  fetchChildSummary,
  fetchRawReport,
  updateObservation,
  updateChildProfile,
  askChildQuestion,
  translateSummary,
  translatePendingTasks,
  fetchDedupedTasks,
  inferGenders,
  type Center,
  type ChildDoc,
  type Observation,
  type RosterStats,
  type ChildSummaryResponse,
  type TranslatedSummaryResponse,

} from "../api";
import ProfileCard from "./ProfileCard";
import CollapsibleSection from "./CollapsibleSection";
import BehavioralTimeline from "./BehavioralTimeline";
import ChildRiskDashboard from "./ChildRiskDashboard";
import FallingThroughCracks from "./FallingThroughCracks";
import BalgruhaHeatMap from "./BalgruhaHeatMap";
import TaskAnalytics from "./TaskAnalytics";
import SuccessStories from "./SuccessStories";
import { useToast } from "../toast";

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

function parseSummary(text: string) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let currentParagraphLines: string[] = [];

  const flushParagraph = (key: number) => {
    if (currentParagraphLines.length > 0) {
      elements.push(
        <p key={`p-${key}`} className="ai-summary-paragraph" style={{ marginBottom: 12, lineHeight: 1.6 }}>
          {currentParagraphLines.join(" ")}
        </p>
      );
      currentParagraphLines = [];
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("###")) {
      flushParagraph(idx);
      const headingText = trimmed.replace(/^###\s+/, "");
      elements.push(
        <h4 key={`h-${idx}`} className="ai-summary-heading">
          {headingText}
        </h4>
      );
    } else if (trimmed === "") {
      flushParagraph(idx);
    } else {
      currentParagraphLines.push(trimmed);
    }
  });

  flushParagraph(lines.length);
  return elements;
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

export interface RosterInsightsProps {
  initialCenter?: string;
  initialChildName?: string;
}

export default function RosterInsights({ initialCenter, initialChildName }: RosterInsightsProps = {}) {
  const [insightsTab, setInsightsTab] = useState<
    "roster" | "risk-dashboard" | "falling-cracks" | "heatmap" | "task-analytics" | "success-stories"
  >("roster");
  const [centers, setCenters] = useState<Center[]>([]);
  const [selectedCenter, setSelectedCenter] = useState("");
  const [kids, setKids] = useState<ChildDoc[]>([]);
  const [stats, setStats] = useState<RosterStats | null>(null);
  const [search, setSearch] = useState("");
  const [selectedKid, setSelectedKid] = useState<string | null>(null);
  const [kidDoc, setKidDoc] = useState<ChildDoc | null>(null);
  const [obsHistory, setObsHistory] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    idx: number;
    obs: Observation;
  } | null>(null);

  const toast = useToast();
  const [summary, setSummary] = useState<ChildSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [translatedSummary, setTranslatedSummary] = useState<TranslatedSummaryResponse | null>(null);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [dedupedTasks, setDedupedTasks] = useState<string[] | null>(null);
  const [translatedTasks, setTranslatedTasks] = useState<string[] | null>(null);
  const [tasksTranslationLoading, setTasksTranslationLoading] = useState(false);
  const [tasksTranslationError, setTasksTranslationError] = useState<string | null>(null);
  const [showTasksTranslation, setShowTasksTranslation] = useState(false);
  const [dedupedTasksLoading, setDedupedTasksLoading] = useState(false);
  const [dedupedTasksError, setDedupedTasksError] = useState<string | null>(null);

  const [tasksViewMode, setTasksViewMode] = useState<"ai" | "raw">("ai");
  const [rawReports, setRawReports] = useState<Record<string, { loading: boolean; text?: string; error?: string }>>({});

  // Directory sorting & filtering state
  const [sortBy, setSortBy] = useState<"name" | "observations">("name");
  const [traumaFilter, setTraumaFilter] = useState<string>("all");
  const [genderInferring, setGenderInferring] = useState(false);


  // Editing state for observation reports
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Observation | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  // Q&A Chat Assistant state
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantInput, setAssistantInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ sender: "user" | "ai"; text: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Gender edit state
  const [genderEditOpen, setGenderEditOpen] = useState(false);
  const [genderEditValue, setGenderEditValue] = useState("");
  const [genderSaving, setGenderSaving] = useState(false);

  // Risk category edit state
  const [riskEditOpen, setRiskEditOpen] = useState(false);
  const [riskEditValue, setRiskEditValue] = useState("");
  const [riskSaving, setRiskSaving] = useState(false);

  const handleFetchSummary = async (kidId: string, forceRefresh = false) => {
    setSummaryLoading(true);
    setSummaryError(null);
    if (forceRefresh) {
      setTranslatedSummary(null);
      setShowTranslation(false);
      setTranslationError(null);
    }
    try {
      const res = await fetchChildSummary(kidId, forceRefresh);
      setSummary(res);
    } catch (e) {
      setSummaryError(String(e));
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleSaveGender = async () => {
    if (!selectedKid || !kidDoc) return;
    setGenderSaving(true);
    try {
      await updateChildProfile(selectedKid, { gender: genderEditValue || "unknown" });
      const newGender = genderEditValue || "unknown";
      setKidDoc((prev) => prev ? { ...prev, gender: newGender } : prev);
      setKids((prev) =>
        prev.map((k) => k._id === selectedKid ? { ...k, gender: newGender } : k)
      );
      setGenderEditOpen(false);
      toast.push({ kind: "success", message: "Gender updated." });
    } catch (e) {
      toast.push({ kind: "error", message: "Failed to update gender: " + String(e) });
    } finally {
      setGenderSaving(false);
    }
  };

  const handleSaveRisk = async () => {
    if (!selectedKid || !kidDoc) return;
    setRiskSaving(true);
    try {
      await updateChildProfile(selectedKid, { risk_category: riskEditValue || "" });
      const newRisk = riskEditValue || "";
      setKidDoc((prev) => prev ? { ...prev, risk_category: newRisk } : prev);
      setKids((prev) =>
        prev.map((k) => k._id === selectedKid ? { ...k, risk_category: newRisk } : k)
      );
      setRiskEditOpen(false);
      toast.push({ kind: "success", message: "Risk category updated." });
    } catch (e) {
      toast.push({ kind: "error", message: "Failed to update risk category: " + String(e) });
    } finally {
      setRiskSaving(false);
    }
  };

  const handleFetchTranslation = async (kidId: string, forceRefresh = false) => {
    setTranslationLoading(true);
    setTranslationError(null);
    try {
      const res = await translateSummary(kidId, "hi", forceRefresh);
      setTranslatedSummary(res);
      setShowTranslation(true);
    } catch (e) {
      setTranslationError(String(e));
    } finally {
      setTranslationLoading(false);
    }
  };

  const handleFetchDedupedTasks = async (kidId: string) => {
    setDedupedTasksLoading(true);
    setDedupedTasksError(null);
    try {
      const res = await fetchDedupedTasks(kidId);
      setDedupedTasks(res.tasks);
    } catch (e) {
      setDedupedTasksError(String(e));
    } finally {
      setDedupedTasksLoading(false);
    }
  };

  const handleFetchTranslatedTasks = async (kidId: string, refresh = false) => {
    setTasksTranslationLoading(true);
    setTasksTranslationError(null);
    try {
      const res = await translatePendingTasks(kidId, "hi", refresh);
      setTranslatedTasks(res.translated);
      setShowTasksTranslation(true);
    } catch (e) {
      setTasksTranslationError(String(e));
    } finally {
      setTasksTranslationLoading(false);
    }
  };


  const handleFetchRawReport = async (reportHash: string, centerName?: string) => {
    setRawReports((prev) => ({
      ...prev,
      [reportHash]: { loading: true }
    }));
    try {
      const res = await fetchRawReport(reportHash, centerName);
      setRawReports((prev) => ({
        ...prev,
        [reportHash]: { loading: false, text: res.raw_report || "No raw text available." }
      }));
    } catch (e) {
      setRawReports((prev) => ({
        ...prev,
        [reportHash]: { loading: false, error: String(e) }
      }));
    }
  };

  const handleStartEdit = (obs: Observation) => {
    const key = obs.report_hash || `${obs.date}_${obs.reportTitle}`;
    setEditingKey(key);
    setEditForm({ ...obs });
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditForm(null);
  };

  const handleSaveEdit = async () => {
    if (!selectedKid || !editForm) return;
    setSaveLoading(true);
    try {
      const psychologistName = editForm.psychologistName?.trim() || "";
      const testsDone = editForm.testsDone?.trim() || "";
      const observations = editForm.observations?.trim() || "";
      const psychologicalNotes = editForm.psychologicalNotes?.trim() || "";
      const generalBackground = editForm.generalBackground?.trim() || "";
      const followUp = editForm.followUp?.trim() || "";

      let actionItems: string[] = [];
      if (typeof editForm.actionItems === "string") {
        actionItems = (editForm.actionItems as string)
          .split("\n")
          .map((a) => a.trim())
          .filter(Boolean);
      } else if (Array.isArray(editForm.actionItems)) {
        actionItems = editForm.actionItems;
      }

      let coachesInvolved: string[] = [];
      if (typeof editForm.coachesInvolved === "string") {
        coachesInvolved = (editForm.coachesInvolved as string)
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
      } else if (Array.isArray(editForm.coachesInvolved)) {
        coachesInvolved = editForm.coachesInvolved;
      }

      const res = await updateObservation(selectedKid, {
        report_hash: editForm.report_hash,
        date: editForm.report_hash ? undefined : editForm.date,
        reportTitle: editForm.report_hash ? undefined : editForm.reportTitle,
        fields: {
          psychologistName,
          testsDone,
          observations,
          psychologicalNotes,
          generalBackground,
          followUp,
          actionItems,
          coachesInvolved,
        },
      });

      if (res.modified > 0) {
        toast.push({ kind: "success", message: "Observation updated successfully." });
      } else {
        toast.push({ kind: "info", message: res.message || "No changes made." });
      }

      // Refresh observations
      const newObs = await fetchObservations(selectedKid);
      setObsHistory(newObs);

      // Refresh child details to update top-level background / summary inputs
      const newDoc = await fetchChild(selectedKid);
      setKidDoc(newDoc);

      // Trigger AI summary refresh/regeneration
      handleFetchSummary(selectedKid, true);
      setDedupedTasks(null);
      setTranslatedTasks(null);
      setTasksViewMode("ai");


      // Exit edit mode
      setEditingKey(null);
      setEditForm(null);
    } catch (e) {
      toast.push({ kind: "error", message: "Failed to update observation: " + String(e) });
    } finally {
      setSaveLoading(false);
    }
  };

  const handleSendQuestion = async (text: string) => {
    const query = text.trim();
    if (!query || !selectedKid) return;

    setChatHistory((prev) => [...prev, { sender: "user", text: query }]);
    setAssistantInput("");
    setChatLoading(true);

    try {
      const res = await askChildQuestion(selectedKid, query);
      setChatHistory((prev) => [...prev, { sender: "ai", text: res.answer }]);
    } catch (e) {
      toast.push({
        kind: "error",
        message: "Failed to get answer: " + String(e),
      });
      setChatHistory((prev) => [
        ...prev,
        { sender: "ai", text: "Sorry, I encountered an error while processing your request. Please try again." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Close delete popover when clicking outside of it
  useEffect(() => {
    if (!deleteConfirm) return;
    const onClickAway = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".delete-popover") || target.closest(".btn-danger")) return;
      setDeleteConfirm(null);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [deleteConfirm]);

  // Load centers
  useEffect(() => {
    fetchCenters().then(setCenters).catch(() => setCenters([]));
  }, []);

  // Handle initialCenter navigation prop (e.g. from Admin Panel click)
  useEffect(() => {
    if (!initialCenter) return;
    setInsightsTab("roster");
    if (centers.length > 0) {
      const match = centers.find(
        (c) => c.name.toLowerCase().trim() === initialCenter.toLowerCase().trim()
      );
      if (match) {
        setSelectedCenter(match.name);
      } else {
        setSelectedCenter(initialCenter);
      }
    } else {
      setSelectedCenter(initialCenter);
    }
  }, [initialCenter, centers]);

  // Handle initialChildName navigation prop (e.g. from Admin Panel click)
  useEffect(() => {
    if (!initialChildName || kids.length === 0) return;
    const match = kids.find(
      (k) =>
        k.child_name?.toLowerCase().trim() === initialChildName.toLowerCase().trim() ||
        (k.child_name && k.child_name.toLowerCase().includes(initialChildName.toLowerCase()))
    );
    if (match) {
      setSelectedKid(match._id);
    } else {
      setSearch(initialChildName);
    }
  }, [initialChildName, kids]);

  // Load roster when center changes
  useEffect(() => {
    if (!selectedCenter) {
      setKids([]);
      setStats(null);
      setSelectedKid(null);
      return;
    }
    setLoading(true);
    setSelectedKid(null);
    setKidDoc(null);
    setObsHistory([]);
    fetchRoster(selectedCenter)
      .then(async (r) => {
        setKids(r.children);
        setStats(r.stats);
        // AI gender inference for children missing a gender field
        const toInfer = r.children.filter(
          (k) => !k.gender || k.gender === "unknown"
        );
        if (toInfer.length > 0) {
          setGenderInferring(true);
          try {
            const names = toInfer.map((k) => k.child_name ?? "");
            const ids = toInfer.map((k) => k._id ?? "");
            const res = await inferGenders(names, ids);
            // Merge inferred genders back into kids array
            const genderMap = new Map<string, string>();
            toInfer.forEach((k, i) => {
              if (res.genders[i] && res.genders[i] !== "unknown") {
                genderMap.set(k._id ?? "", res.genders[i]);
              }
            });
            setKids((prev) =>
              prev.map((k) =>
                genderMap.has(k._id ?? "")
                  ? { ...k, gender: genderMap.get(k._id ?? "") }
                  : k
              )
            );
          } catch {
            // silent — gender inference is non-critical
          } finally {
            setGenderInferring(false);
          }
        }
      })
      .catch(() => {
        setKids([]);
        setStats(null);
      })
      .finally(() => setLoading(false));
  }, [selectedCenter]);

  // Load kid details when selected
  useEffect(() => {
    setSummary(null);
    setSummaryLoading(false);
    setSummaryError(null);
    setTranslatedSummary(null);
    setTranslationLoading(false);
    setTranslationError(null);
    setShowTranslation(false);
    setDedupedTasks(null);
    setTranslatedTasks(null);
    setTasksTranslationLoading(false);
    setTasksTranslationError(null);
    setShowTasksTranslation(false);
    setDedupedTasksLoading(false);
    setDedupedTasksError(null);
    setTasksViewMode("ai");

    setRawReports({});
    setAssistantOpen(false);
    setAssistantInput("");
    setChatHistory([]);
    setChatLoading(false);
    setGenderEditOpen(false);
    setGenderEditValue("");
    setRiskEditOpen(false);
    setRiskEditValue("");


    if (!selectedKid) {
      setKidDoc(null);
      setObsHistory([]);
      return;
    }
    Promise.all([fetchChild(selectedKid), fetchObservations(selectedKid)])
      .then(([doc, obs]) => {
        setKidDoc(doc);
        setObsHistory(obs);
      })
      .catch(() => {
        setKidDoc(null);
        setObsHistory([]);
      });
  }, [selectedKid]);

  // Helper to infer trauma category dynamically
  const getChildTraumaCategory = (k: ChildDoc): string => {
    if (k.trauma_category) return k.trauma_category;
    const text = [
      k.nature,
      k.nature_behavior,
      k.weakness,
      k.strengths,
      k.parent_status,
      k.dob
    ].join(" ").toLowerCase();
    
    if (text.includes("jail") || text.includes("murder") || text.includes("crime")) {
      return "Parental Incarceration";
    }
    if (text.includes("orphan") || text.includes("abandon") || text.includes("parent status: none")) {
      return "Abandonment / Neglect";
    }
    if (text.includes("anxious") || text.includes("withdrawn") || text.includes("fear") || text.includes("shy")) {
      return "Emotional / Anxiety";
    }
    if (text.includes("one parent") || text.includes("single parent") || text.includes("divorce")) {
      return "Family Disruption";
    }
    return "General Support / Unspecified";
  };

  const distinctTraumas = useMemo(() => {
    const categories = new Set<string>();
    kids.forEach(k => {
      categories.add(getChildTraumaCategory(k));
    });
    return Array.from(categories).sort();
  }, [kids]);

  const filteredKids = useMemo(() => {
    let result = kids;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(k => k.child_name.toLowerCase().includes(q));
    }
    
    if (traumaFilter !== "all") {
      result = result.filter(k => getChildTraumaCategory(k) === traumaFilter);
    }
    
    result = [...result].sort((a, b) => {
      if (sortBy === "name") {
        return a.child_name.localeCompare(b.child_name);
      } else if (sortBy === "observations") {
        const aObs = a.observations?.length ?? 0;
        const bObs = b.observations?.length ?? 0;
        if (bObs !== aObs) {
          return bObs - aObs;
        }
        return a.child_name.localeCompare(b.child_name);
      }
      return 0;
    });
    
    return result;
  }, [kids, search, traumaFilter, sortBy]);


  const handleDeleteObs = async (
    obs: Observation,
    scope: "single" | "all",
  ) => {
    if (!selectedKid) return;
    try {
      await deleteObservation(selectedKid, {
        date: obs.date,
        reportTitle: obs.reportTitle,
        scope,
      });
      // Refresh
      const newObs = await fetchObservations(selectedKid);
      setObsHistory(newObs);
      setDedupedTasks(null);
      setTranslatedTasks(null);
      setTasksViewMode("ai");

      // refresh roster stats too
      if (selectedCenter) {
        fetchRoster(selectedCenter).then((r) => {
          setKids(r.children);
          setStats(r.stats);
        });
      }
    } catch (e) {
      alert("Delete failed: " + String(e));
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleExportChild = (format: "json" | "csv") => {
    if (!kidDoc) return;
    const data = {
      child_id: kidDoc._id,
      child_name: kidDoc.child_name,
      balgruha_name: kidDoc.balgruha_name,
      class_studying: kidDoc.class_studying,
      dob: kidDoc.dob,
      parent_status: kidDoc.parent_status,
      strengths: kidDoc.strengths,
      weakness: kidDoc.weakness,
      nature_behavior: kidDoc.nature_behavior,
      observations: obsHistory.map((o) => ({
        date: fmtDate(o.date),
        reportTitle: o.reportTitle,
        centerName: o.centerName,
        generalBackground: o.generalBackground,
        psychologicalNotes: o.psychologicalNotes,
        actionItems: o.actionItems,
        coachesInvolved: o.coachesInvolved,
      })),
    };

    const fname = kidDoc.child_name.replace(/\s+/g, "_");
    if (format === "json") {
      downloadBlob(JSON.stringify(data, null, 2), `${fname}_history.json`, "application/json");
    } else {
      const header =
        "Date,Report Title,Center Name,Coaches Involved,General Background,Psychological Notes,Action Items\n";
      const rows = data.observations
        .map((o) => {
          const coaches = Array.isArray(o.coachesInvolved)
            ? o.coachesInvolved.join(", ")
            : (o.coachesInvolved ?? "");
          const actions = Array.isArray(o.actionItems)
            ? o.actionItems.join("; ")
            : (o.actionItems ?? "");
          return [
            `"${o.date}"`,
            `"${o.reportTitle ?? ""}"`,
            `"${o.centerName ?? ""}"`,
            `"${coaches}"`,
            `"${(o.generalBackground ?? "").replace(/"/g, '""')}"`,
            `"${(o.psychologicalNotes ?? "").replace(/"/g, '""')}"`,
            `"${actions.replace(/"/g, '""')}"`,
          ].join(",");
        })
        .join("\n");
      downloadBlob(header + rows, `${fname}_history.csv`, "text/csv");
    }
  };

  const totalKids = kids.length;
  const maleKids = kids.filter((k) => k.gender?.toLowerCase() === "male" || k.gender?.toLowerCase() === "m").length;
  const femaleKids = kids.filter((k) => k.gender?.toLowerCase() === "female" || k.gender?.toLowerCase() === "f").length;

  return (
    <>
      <h2 className="section-heading">
        <span className="msym">insights</span> Evaluation / InnerMap
      </h2>
      <p className="muted" style={{ marginBottom: 20 }}>
        Browse historical observations, trace child progress over time, track risk levels, and view analytics.
      </p>

      {/* Evaluation Sub-Tabs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        <button
          className={`tab-btn ${insightsTab === "roster" ? "active" : ""}`}
          onClick={() => setInsightsTab("roster")}
        >
          <span className="msym">folder_shared</span>
          Child Directory & History
        </button>
        <button
          className={`tab-btn ${insightsTab === "risk-dashboard" ? "active" : ""}`}
          onClick={() => setInsightsTab("risk-dashboard")}
        >
          <span className="msym">dashboard</span>
          Risk Dashboard
        </button>
        <button
          className={`tab-btn ${insightsTab === "falling-cracks" ? "active" : ""}`}
          onClick={() => setInsightsTab("falling-cracks")}
        >
          <span className="msym">warning</span>
          Falling Through Cracks
        </button>
        <button
          className={`tab-btn ${insightsTab === "heatmap" ? "active" : ""}`}
          onClick={() => setInsightsTab("heatmap")}
        >
          <span className="msym">map</span>
          Balgruha Heat Map
        </button>
        <button
          className={`tab-btn ${insightsTab === "task-analytics" ? "active" : ""}`}
          onClick={() => setInsightsTab("task-analytics")}
        >
          <span className="msym">analytics</span>
          Task Analytics
        </button>
        <button
          className={`tab-btn ${insightsTab === "success-stories" ? "active" : ""}`}
          onClick={() => setInsightsTab("success-stories")}
        >
          <span className="msym">verified</span>
          Success Stories
        </button>
      </div>

      {insightsTab === "risk-dashboard" && (
        <ChildRiskDashboard
          onSelectChild={(childName, balgruhaName) => {
            setSelectedCenter(balgruhaName);
            setSearch(childName);
            setInsightsTab("roster");
          }}
        />
      )}

      {insightsTab === "falling-cracks" && (
        <FallingThroughCracks
          onSelectChild={(childName, balgruhaName) => {
            setSelectedCenter(balgruhaName);
            setSearch(childName);
            setInsightsTab("roster");
          }}
        />
      )}

      {insightsTab === "heatmap" && (
        <BalgruhaHeatMap
          onSelectCenter={(balgruhaName) => {
            setSelectedCenter(balgruhaName);
            setInsightsTab("roster");
          }}
        />
      )}

      {insightsTab === "task-analytics" && <TaskAnalytics />}

      {insightsTab === "success-stories" && <SuccessStories />}

      {insightsTab === "roster" && (
        <>
          {/* Center selector */}
          <div className="form-group" style={{ maxWidth: 400, marginBottom: 24 }}>
        <label htmlFor="roster-center">Select Center / Balgruha</label>
        <select
          id="roster-center"
          className="form-select"
          value={selectedCenter}
          onChange={(e) => setSelectedCenter(e.target.value)}
        >
          <option value="">— Select Center —</option>
          {centers.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="spinner-overlay" style={{ padding: 40 }}>
          <div className="spin-ring" />
          <p className="muted">Loading roster…</p>
        </div>
      )}

      {!loading && selectedCenter && kids.length === 0 && (
        <div className="alert alert-info">
          No children found for this center.
        </div>
      )}

      {!loading && stats && kids.length > 0 && (
        <>
          {/* Stats */}
          <div className="metrics-row responsive-metrics">
            {[
              { icon: "group", value: stats.total_children, label: "Total Children" },
              { icon: "visibility", value: stats.total_observations, label: "Total Observations" },
              { icon: "supervisor_account", value: stats.active_coaches, label: "Active Coaches" },
              {
                icon: "assignment",
                value: kids.filter((k) => k.observations?.some((o) => o.actionItems && o.actionItems.length > 0)).length,
                label: "Pending Tasks",
              },
            ].map((m) => (
              <div className="metric glass" key={m.label}>
                <span className="metric-icon msym" aria-hidden="true">
                  {m.icon}
                </span>
                <div className="metric-value">{m.value}</div>
                <div className="metric-label">
                  <span className="msym">{m.icon}</span> {m.label}
                </div>
              </div>
            ))}
          </div>

          {/* Roster layout — uses CSS var for grid columns so media queries
              in components.css can collapse to single column on mobile without
              being overridden by an inline style (inline styles always win
              over media-query selectors; CSS vars are resolved at use site). */}
          <div className="roster-layout" style={{ ['--roster-cols' as string]: '240px 1fr' }}>
            {/* Left panel: child directory */}
            <div className="glass page-pad col gap-8 roster-sidebar">
              <h3 className="roster-sidebar-title" style={{ marginBottom: 6 }}>Child Directory</h3>
              {/* Gender & total stats row */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: "rgba(99,102,241,0.12)", borderRadius: 20,
                  padding: "3px 10px", fontSize: 12, fontWeight: 600,
                  color: "var(--md-sys-color-on-surface)",
                }}>
                  <span className="msym" style={{ fontSize: 14 }}>group</span> {totalKids} Total
                </span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: "rgba(59,130,246,0.13)", borderRadius: 20,
                  padding: "3px 10px", fontSize: 12, fontWeight: 700,
                  color: "#3b82f6",
                }}>
                  ♂ {maleKids} Male
                </span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: "rgba(236,72,153,0.13)", borderRadius: 20,
                  padding: "3px 10px", fontSize: 12, fontWeight: 700,
                  color: "#ec4899",
                }}>
                  ♀ {femaleKids} Female
                </span>
                {genderInferring && (
                  <span style={{ fontSize: 11, color: "var(--md-sys-color-on-surface-variant)", display: "flex", alignItems: "center", gap: 4 }}>
                    <span className="msym" style={{ fontSize: 13, animation: "spin 1.2s linear infinite" }}>autorenew</span>
                    AI detecting…
                  </span>
                )}
              </div>
              <div className="search-box" style={{ marginBottom: 8 }}>
                <span className="msym search-box-icon" aria-hidden="true">search</span>
                <input
                  className="form-input search-box-input"
                  placeholder="Search by name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Sort and Filter controls */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--md-sys-color-on-surface-variant)" }}>Sort By</label>
                  <select
                    className="form-select"
                    style={{ padding: "6px 8px", fontSize: 12, height: "auto", backgroundPosition: "right 8px center" }}
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                  >
                    <option value="name">Alphabetical A-Z</option>
                    <option value="observations">No. of Observations</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--md-sys-color-on-surface-variant)" }}>Trauma Filter</label>
                  <select
                    className="form-select"
                    style={{ padding: "6px 8px", fontSize: 12, height: "auto", backgroundPosition: "right 8px center" }}
                    value={traumaFilter}
                    onChange={(e) => setTraumaFilter(e.target.value)}
                  >
                    <option value="all">All Traumas</option>
                    {distinctTraumas.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {filteredKids.length === 0 ? (
                <p className="muted center">No matches</p>
              ) : (
                <ul className="child-list roster-child-list">
                  {filteredKids.map((k) => (
                    <li
                      key={k._id}
                      className={`child-list-item${selectedKid === k._id ? " selected" : ""}`}
                      onClick={() => setSelectedKid(k._id)}
                    >
                      <div className="mini-avatar">
                        {(() => {
                          let purl = k.photo_url;
                          if (purl) {
                            if (purl.startsWith("http")) {
                              if (purl.includes("storage.googleapis.com")) {
                                const parts = purl.split("/");
                                const filename = parts[parts.length - 1];
                                purl = `/api/uploads/${filename}`;
                              } else if (purl.includes("purestore.io")) {
                                const parts = purl.split("/");
                                const filename = parts[parts.length - 1];
                                const folder = parts[parts.length - 2];
                                purl = `/api/purestore/${folder}/${filename}`;
                              }
                            } else if (!purl.startsWith("/")) {
                              purl = `/api/uploads/${purl}`;
                            }
                            return (
                              <img
                                src={purl}
                                alt=""
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                  const parent = (e.target as HTMLImageElement).parentElement;
                                  if (parent) {
                                    parent.innerHTML = '<span class="msym">person</span>';
                                  }
                                }}
                              />
                            );
                          }
                          return <span className="msym">person</span>;
                        })()}
                      </div>
                      <div className="child-list-meta">
                        <div className="child-list-name">{k.child_name}</div>
                        <div className="muted child-list-sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span>{(k.observations?.length ?? 0)} obs</span>
                          {k.gender === "male" && (
                            <span style={{
                              fontSize: 10, fontWeight: 700,
                              color: "#3b82f6",
                              background: "rgba(59,130,246,0.12)",
                              borderRadius: 10, padding: "1px 6px",
                            }}>♂ M</span>
                          )}
                          {k.gender === "female" && (
                            <span style={{
                              fontSize: 10, fontWeight: 700,
                              color: "#ec4899",
                              background: "rgba(236,72,153,0.12)",
                              borderRadius: 10, padding: "1px 6px",
                            }}>♀ F</span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Right panel: child detail + timeline */}
            <div>
              {!selectedKid && (
                <div className="glass page-pad roster-empty">
                  <span className="msym roster-empty-icon" aria-hidden="true">
                    person_search
                  </span>
                  <p className="muted">
                    Select a child from the directory to view details and
                    history.
                  </p>
                </div>
              )}

              {kidDoc && (
                <>
                  <div className="glass page-pad profile-card roster-profile-card">
                    <h2 className="roster-child-name-h2">{kidDoc.child_name}</h2>

                    {/* ── Gender editor ── */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                      {/* Current gender display */}
                      {kidDoc.gender === "male" && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          background: "rgba(59,130,246,0.13)", borderRadius: 20,
                          padding: "4px 12px", fontSize: 13, fontWeight: 700, color: "#3b82f6",
                        }}>♂ Male</span>
                      )}
                      {kidDoc.gender === "female" && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          background: "rgba(236,72,153,0.13)", borderRadius: 20,
                          padding: "4px 12px", fontSize: 13, fontWeight: 700, color: "#ec4899",
                        }}>♀ Female</span>
                      )}
                      {(!kidDoc.gender || kidDoc.gender === "unknown") && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          background: "rgba(148,163,184,0.15)", borderRadius: 20,
                          padding: "4px 12px", fontSize: 13, fontWeight: 600,
                          color: "var(--md-sys-color-on-surface-variant)",
                        }}>⚬ Gender unknown</span>
                      )}

                      {/* Edit button / inline editor */}
                      {!genderEditOpen ? (
                        <button
                          className="btn btn-tonal btn-sm"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => { setGenderEditValue(kidDoc.gender ?? ""); setGenderEditOpen(true); }}
                        >
                          <span className="msym" style={{ fontSize: 15 }}>edit</span> Edit gender
                        </button>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <select
                            className="form-select"
                            style={{ padding: "4px 10px", fontSize: 13, height: "auto", minWidth: 130 }}
                            value={genderEditValue}
                            onChange={(e) => setGenderEditValue(e.target.value)}
                          >
                            <option value="male">♂ Male</option>
                            <option value="female">♀ Female</option>
                            <option value="unknown">⚬ Unknown</option>
                          </select>
                          <button
                            className="btn btn-filled btn-sm"
                            style={{ padding: "4px 12px", fontSize: 12 }}
                            disabled={genderSaving}
                            onClick={handleSaveGender}
                          >
                            {genderSaving ? "Saving…" : "Save"}
                          </button>
                          <button
                            className="btn btn-tonal btn-sm"
                            style={{ padding: "4px 10px", fontSize: 12 }}
                            disabled={genderSaving}
                            onClick={() => setGenderEditOpen(false)}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>

                    {/* ── Risk Category editor ── */}
                    {(() => {
                      const RISK_OPTIONS = [
                        {
                          value: "high_risk",
                          label: "🔴 High Risk",
                          sub: "Unprocessed Trauma",
                          color: "#ef4444",
                          bg: "rgba(239,68,68,0.12)",
                        },
                        {
                          value: "ongoing_trauma",
                          label: "🟠 Ongoing Trauma",
                          sub: "Active support needed",
                          color: "#f97316",
                          bg: "rgba(249,115,22,0.12)",
                        },
                        {
                          value: "identity_formed",
                          label: "🟢 Identity Formed",
                          sub: "Stable, progressing well",
                          color: "#22c55e",
                          bg: "rgba(34,197,94,0.12)",
                        },
                      ];
                      const current = RISK_OPTIONS.find((o) => o.value === kidDoc.risk_category);
                      return (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                          {/* Badge */}
                          {current ? (
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 5,
                              background: current.bg, borderRadius: 20,
                              padding: "4px 14px", fontSize: 13, fontWeight: 700, color: current.color,
                            }}>
                              {current.label}
                              <span style={{ fontWeight: 400, fontSize: 11, opacity: 0.85 }}>· {current.sub}</span>
                            </span>
                          ) : (
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 5,
                              background: "rgba(148,163,184,0.15)", borderRadius: 20,
                              padding: "4px 12px", fontSize: 13, fontWeight: 600,
                              color: "var(--md-sys-color-on-surface-variant)",
                            }}>⚪ No risk category set</span>
                          )}

                          {/* Edit button / inline editor */}
                          {!riskEditOpen ? (
                            <button
                              className="btn btn-tonal btn-sm"
                              style={{ padding: "4px 10px", fontSize: 12 }}
                              onClick={() => { setRiskEditValue(kidDoc.risk_category ?? ""); setRiskEditOpen(true); }}
                            >
                              <span className="msym" style={{ fontSize: 15 }}>edit</span> Edit
                            </button>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <select
                                className="form-select"
                                style={{ padding: "4px 10px", fontSize: 13, height: "auto", minWidth: 180 }}
                                value={riskEditValue}
                                onChange={(e) => setRiskEditValue(e.target.value)}
                              >
                                <option value="">— Not set —</option>
                                <option value="high_risk">🔴 High Risk (Unprocessed Trauma)</option>
                                <option value="ongoing_trauma">🟠 Ongoing Trauma</option>
                                <option value="identity_formed">🟢 Identity Formed</option>
                              </select>
                              <button
                                className="btn btn-filled btn-sm"
                                style={{ padding: "4px 12px", fontSize: 12 }}
                                disabled={riskSaving}
                                onClick={handleSaveRisk}
                              >
                                {riskSaving ? "Saving…" : "Save"}
                              </button>
                              <button
                                className="btn btn-tonal btn-sm"
                                style={{ padding: "4px 10px", fontSize: 12 }}
                                disabled={riskSaving}
                                onClick={() => setRiskEditOpen(false)}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <ProfileCard doc={kidDoc} hideBadge />
                  </div>

                  <h3 className="section-heading roster-history-heading">
                    <span className="msym">timeline</span> History & Details
                  </h3>

                  {obsHistory.length > 0 && (
                    <div className="export-row">
                      <button
                        className="btn btn-tonal btn-sm"
                        onClick={() => handleExportChild("json")}
                      >
                        <span className="msym">download</span> Export JSON
                      </button>
                      <button
                        className="btn btn-tonal btn-sm"
                        onClick={() => handleExportChild("csv")}
                      >
                        <span className="msym">download</span> Export CSV
                      </button>
                    </div>
                  )}

                  {obsHistory.length === 0 ? (
                    <div className="alert alert-info">
                      No observation history recorded for this child.
                    </div>
                  ) : (
                    <div className="collapse-stack">
                      {/* ── 1. General Background (moved out of report cards) ── */}
                      {(() => {
                        const latestBgObs = obsHistory.find((o) => o.generalBackground?.trim());
                        const latestBg = latestBgObs?.generalBackground?.trim() ?? "";
                        const latestBgDate = latestBgObs?.date ? fmtDate(latestBgObs.date) : "";
                        
                        const olderBgVersions = obsHistory.filter((o) => {
                          if (!o.generalBackground?.trim()) return false;
                          if (latestBgObs && o.date === latestBgObs.date) return false;
                          return o.generalBackground.trim() !== latestBg;
                        });

                        const seenBgs = new Set<string>([latestBg]);
                        const uniqueOlderBgObs: Observation[] = [];
                        for (const o of olderBgVersions) {
                          const bg = o.generalBackground!.trim();
                          if (!seenBgs.has(bg)) {
                            seenBgs.add(bg);
                            uniqueOlderBgObs.push(o);
                          }
                        }

                        return (
                          <CollapsibleSection title="General Background" icon="assignment">
                            {latestBg ? (
                              <div>
                                <div style={{ whiteSpace: "pre-wrap" }}>{latestBg}</div>
                                <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                                  As of {latestBgDate}
                                </div>
                                {uniqueOlderBgObs.length > 0 && (
                                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--md-sys-color-outline-variant)" }}>
                                    <strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>Older versions:</strong>
                                    {uniqueOlderBgObs.map((o, index) => (
                                      <div key={index} style={{ marginBottom: 12 }}>
                                        <div style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "var(--md-sys-color-on-surface-variant)" }}>
                                          {o.generalBackground}
                                        </div>
                                        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                                          As of {fmtDate(o.date)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="muted">No general background recorded.</p>
                            )}
                          </CollapsibleSection>
                        );
                      })()}

                      {/* ── 2. AI Summary of all reports (lazy — first click) ── */}
                      <CollapsibleSection
                        key={selectedKid}
                        title="AI Summary of All Reports"
                        icon="auto_awesome"
                        variant="primary"
                        onFirstOpen={() => selectedKid && handleFetchSummary(selectedKid)}
                      >
                        {summaryLoading && (
                          <div className="spinner-overlay" style={{ padding: 20 }}>
                            <div className="spin-ring" />
                            <p className="muted">Generating AI summary…</p>
                          </div>
                        )}
                        {summaryError && (
                          <div className="alert alert-error" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
                            <div>Failed to load summary: {summaryError}</div>
                            <button className="btn btn-tonal btn-sm" onClick={() => selectedKid && handleFetchSummary(selectedKid)}>
                              Retry
                            </button>
                          </div>
                        )}
                        {!summaryLoading && !summaryError && summary && (
                          <div>
                            {showTranslation && translatedSummary ? (
                              <div className="ai-summary-text">{parseSummary(translatedSummary.translated)}</div>
                            ) : (
                              <div className="ai-summary-text">{parseSummary(summary.summary)}</div>
                            )}

                            {translationError && (
                              <div className="alert alert-error" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, marginTop: 12 }}>
                                <div>Failed to translate: {translationError}</div>
                              </div>
                            )}

                            {translationLoading && (
                              <div className="spinner-overlay" style={{ padding: 20, marginTop: 12 }}>
                                <div className="spin-ring" />
                                <p className="muted">Translating to Hindi…</p>
                              </div>
                            )}

                            <div className="summary-caption" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                              <span>
                                {showTranslation && translatedSummary
                                  ? `Translated on ${fmtDate(translatedSummary.generated_at || undefined)}`
                                  : `Generated on ${fmtDate(summary.generated_at || undefined)}`}
                              </span>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button
                                  className="btn btn-outline btn-sm"
                                  onClick={() => {
                                    if (showTranslation) {
                                      setShowTranslation(false);
                                    } else if (translatedSummary) {
                                      setShowTranslation(true);
                                    } else if (selectedKid) {
                                      handleFetchTranslation(selectedKid);
                                    }
                                  }}
                                  disabled={translationLoading}
                                >
                                  {showTranslation ? (
                                    <>
                                      <span className="msym">language</span> Show English
                                    </>
                                  ) : (
                                    <>
                                      <span className="msym">language</span> Translate to Hindi
                                    </>
                                  )}
                                </button>
                                {showTranslation && (
                                  <button
                                    className="btn btn-outline btn-sm"
                                    onClick={() => selectedKid && handleFetchTranslation(selectedKid, true)}
                                    disabled={translationLoading}
                                    title="Force re-translation from English summary"
                                  >
                                    <span className="msym">autorenew</span> Re-translate
                                  </button>
                                )}
                                <button
                                  className="btn btn-outline btn-sm"
                                  onClick={() => selectedKid && handleFetchSummary(selectedKid, true)}
                                  disabled={translationLoading}
                                >
                                  <span className="msym">autorenew</span> Regenerate
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                        {!summaryLoading && !summaryError && !summary && (
                          <p className="muted">Click to generate clinical AI summary.</p>
                        )}
                      </CollapsibleSection>

                      {/* ── 2b. AI Behavioral Progress Timeline (Week-by-Week) ── */}
                      <CollapsibleSection
                        key={`timeline-${selectedKid}`}
                        title="AI Behavioral Progress Analytics"
                        icon="timeline"
                        variant="primary"
                        defaultOpen={true}
                      >
                        {selectedKid && <BehavioralTimeline childId={selectedKid} childName={kidDoc?.child_name || undefined} />}
                      </CollapsibleSection>

                      {/* ── 3. Pending tasks (aggregated action items) ── */}
                      <CollapsibleSection
                        key={`tasks-${selectedKid}`}
                        title="Pending Tasks"
                        icon="push_pin"
                        badge={
                          dedupedTasks !== null
                            ? dedupedTasks.length
                            : obsHistory.reduce(
                                (n, o) => n + (o.actionItems?.length ?? 0),
                                0,
                              )
                        }
                        onFirstOpen={() => selectedKid && handleFetchDedupedTasks(selectedKid)}
                      >
                        {obsHistory.reduce((n, o) => n + (o.actionItems?.length ?? 0), 0) === 0 ? (
                          <p className="muted">No pending tasks recorded.</p>
                        ) : (
                          <div>
                            {/* Toggle View Mode */}
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                marginBottom: 16,
                                borderBottom: "1px solid var(--md-sys-color-outline-variant)",
                                paddingBottom: 8,
                              }}
                            >
                              <button
                                className={`btn btn-sm ${tasksViewMode === "ai" ? "btn-primary" : "btn-outline"}`}
                                onClick={() => setTasksViewMode("ai")}
                                style={{ display: "flex", alignItems: "center", gap: 6 }}
                              >
                                <span className="msym" style={{ fontSize: 18 }}>psychology</span>
                                AI-Consolidated
                              </button>
                              <button
                                className={`btn btn-sm ${tasksViewMode === "raw" ? "btn-primary" : "btn-outline"}`}
                                onClick={() => setTasksViewMode("raw")}
                                style={{ display: "flex", alignItems: "center", gap: 6 }}
                              >
                                <span className="msym" style={{ fontSize: 18 }}>history</span>
                                Raw History
                              </button>
                            </div>

                            {tasksViewMode === "ai" ? (
                              <div>
                                {dedupedTasksLoading && (
                                  <div className="spinner-overlay" style={{ padding: 20 }}>
                                    <div className="spin-ring" />
                                    <p className="muted">Consolidating tasks using AI…</p>
                                  </div>
                                )}
                                {dedupedTasksError && (
                                  <div className="alert alert-error" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
                                    <div>Failed to load consolidated tasks: {dedupedTasksError}</div>
                                    <button className="btn btn-tonal btn-sm" onClick={() => selectedKid && handleFetchDedupedTasks(selectedKid)}>
                                      Retry
                                    </button>
                                  </div>
                                )}
                                {!dedupedTasksLoading && !dedupedTasksError && dedupedTasks && (
                                  <div>
                                    {dedupedTasks.length === 0 ? (
                                      <p className="muted">AI found no active pending tasks.</p>
                                    ) : (
                                      <div>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                          <span style={{ fontSize: 13, fontWeight: 600 }}>Tasks List</span>
                                          <button
                                            className={`btn btn-sm ${showTasksTranslation ? "btn-primary" : "btn-outline"}`}
                                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", fontSize: 12, height: "auto" }}
                                            onClick={() => {
                                              if (showTasksTranslation) {
                                                setShowTasksTranslation(false);
                                              } else {
                                                if (translatedTasks) {
                                                  setShowTasksTranslation(true);
                                                } else if (selectedKid) {
                                                  handleFetchTranslatedTasks(selectedKid);
                                                }
                                              }
                                            }}
                                            disabled={tasksTranslationLoading}
                                          >
                                            <span className="msym" style={{ fontSize: 16 }}>translate</span>
                                            {tasksTranslationLoading ? "Translating..." : showTasksTranslation ? "Show English" : "Translate to Hindi"}
                                          </button>
                                        </div>

                                        {tasksTranslationError && (
                                          <div className="alert alert-error" style={{ padding: 8, fontSize: 12, marginBottom: 8 }}>
                                            Translation failed: {tasksTranslationError}
                                          </div>
                                        )}

                                        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                                          {(showTasksTranslation && translatedTasks ? translatedTasks : dedupedTasks).map((task, idx) => (
                                            <li
                                              key={idx}
                                              style={{
                                                display: "flex",
                                                alignItems: "flex-start",
                                                gap: 10,
                                                padding: "10px 12px",
                                                borderRadius: 8,
                                                backgroundColor: "var(--md-sys-color-surface-variant)",
                                                marginBottom: 8,
                                                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                                                lineHeight: 1.5,
                                              }}
                                            >
                                              <span className="msym" style={{ color: "var(--md-sys-color-primary)", fontSize: 20, marginTop: 2 }}>
                                                task_alt
                                              </span>
                                              <span style={{ fontSize: 14, fontWeight: 500, color: "var(--md-sys-color-on-surface-variant)" }}>{task}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                )}

                              </div>
                            ) : (
                              <div>
                                {(() => {
                                  const tasksObs = obsHistory.filter(o => o.actionItems && o.actionItems.length > 0);
                                  return tasksObs.map((o, idx) => (
                                    <div key={idx} style={{ marginBottom: 12 }}>
                                      <div className="collapse-divider" style={{ margin: "4px 0 6px" }}>
                                        {fmtDate(o.date)} · {o.reportTitle || "Untitled"}
                                      </div>
                                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                                        {o.actionItems!.map((item, iIdx) => (
                                          <li key={iIdx}>{item}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  ));
                                })()}
                              </div>
                            )}
                          </div>
                        )}
                      </CollapsibleSection>

                      {/* ── 4. Reports — one button per report, named by date ── */}
                      <div className="collapse-divider">
                        Reports · latest → oldest
                      </div>
                      {obsHistory.map((obs, idx) => {
                        const coaches = Array.isArray(obs.coachesInvolved)
                          ? obs.coachesInvolved.join(", ")
                          : "";
                        return (
                          <CollapsibleSection
                            key={idx}
                            title={fmtDate(obs.date)}
                            subtitle={obs.reportTitle ?? "Untitled Report"}
                            icon="description"
                          >
                            {editingKey === (obs.report_hash || `${obs.date}_${obs.reportTitle}`) ? (
                              <div className="edit-obs-form">
                                <div className="edit-form-grid">
                                  <div className="form-group">
                                    <label>Psychologist Name</label>
                                    <input
                                      className="form-input"
                                      value={editForm?.psychologistName || ""}
                                      onChange={(e) => setEditForm(prev => prev ? { ...prev, psychologistName: e.target.value } : null)}
                                      disabled={saveLoading}
                                    />
                                  </div>
                                  <div className="form-group">
                                    <label>Coaches Involved (comma-separated)</label>
                                    <input
                                      className="form-input"
                                      value={
                                        typeof editForm?.coachesInvolved === "string"
                                          ? editForm.coachesInvolved
                                          : Array.isArray(editForm?.coachesInvolved)
                                          ? editForm.coachesInvolved.join(", ")
                                          : ""
                                      }
                                      onChange={(e) => setEditForm(prev => prev ? { ...prev, coachesInvolved: e.target.value as any } : null)}
                                      disabled={saveLoading}
                                    />
                                  </div>
                                  <div className="form-group">
                                    <label>Tests Done</label>
                                    <input
                                      className="form-input"
                                      value={editForm?.testsDone || ""}
                                      onChange={(e) => setEditForm(prev => prev ? { ...prev, testsDone: e.target.value } : null)}
                                      disabled={saveLoading}
                                    />
                                  </div>
                                </div>

                                <div className="form-group">
                                  <label>General Background</label>
                                  <textarea
                                    className="form-textarea"
                                    value={editForm?.generalBackground || ""}
                                    onChange={(e) => setEditForm(prev => prev ? { ...prev, generalBackground: e.target.value } : null)}
                                    disabled={saveLoading}
                                  />
                                </div>

                                <div className="form-group">
                                  <label>Observations</label>
                                  <textarea
                                    className="form-textarea"
                                    value={editForm?.observations || ""}
                                    onChange={(e) => setEditForm(prev => prev ? { ...prev, observations: e.target.value } : null)}
                                    disabled={saveLoading}
                                  />
                                </div>

                                <div className="form-group">
                                  <label>Psychological Notes</label>
                                  <textarea
                                    className="form-textarea"
                                    value={editForm?.psychologicalNotes || ""}
                                    onChange={(e) => setEditForm(prev => prev ? { ...prev, psychologicalNotes: e.target.value } : null)}
                                    disabled={saveLoading}
                                  />
                                </div>

                                <div className="form-group">
                                  <label>Follow up from previous observation</label>
                                  <textarea
                                    className="form-textarea"
                                    value={editForm?.followUp || ""}
                                    onChange={(e) => setEditForm(prev => prev ? { ...prev, followUp: e.target.value } : null)}
                                    disabled={saveLoading}
                                  />
                                </div>

                                <div className="form-group">
                                  <label>New Tasks / Action Items (one per line)</label>
                                  <textarea
                                    className="form-textarea"
                                    placeholder="One task per line"
                                    value={
                                      typeof editForm?.actionItems === "string"
                                        ? editForm.actionItems
                                        : Array.isArray(editForm?.actionItems)
                                        ? editForm.actionItems.join("\n")
                                        : ""
                                    }
                                    onChange={(e) => setEditForm(prev => prev ? { ...prev, actionItems: e.target.value as any } : null)}
                                    disabled={saveLoading}
                                  />
                                </div>

                                <div className="edit-form-actions">
                                  <button
                                    className="btn btn-outline btn-sm"
                                    onClick={handleCancelEdit}
                                    disabled={saveLoading}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    className="btn btn-primary btn-sm"
                                    onClick={handleSaveEdit}
                                    disabled={saveLoading}
                                  >
                                    {saveLoading ? (
                                      <>
                                        <span className="spin msym" style={{ fontSize: 16, marginRight: 6 }}>progress_activity</span>
                                        Saving…
                                      </>
                                    ) : (
                                      "Save Changes"
                                    )}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="timeline-report-details" style={{ fontSize: "14px", lineHeight: "1.6" }}>
                                  <ul style={{ listStyleType: "disc", paddingLeft: 20, margin: "0 0 16px 0" }}>
                                    <li style={{ marginBottom: 6 }}>
                                      <strong>Psychologist name:</strong> {obs.psychologistName || ""}, <strong>Coach name:</strong> {coaches || ""}
                                    </li>
                                    <li style={{ marginBottom: 6 }}>
                                      <strong>Tests done:</strong> {obs.testsDone || ""}
                                    </li>
                                    <li style={{ marginBottom: 6 }}>
                                      <strong>Observations:</strong> {obs.observations || obs.psychologicalNotes || ""}
                                    </li>
                                    <li style={{ marginBottom: 6 }}>
                                      <strong>Follow up from previous observation:</strong> {obs.followUp || ""}
                                    </li>
                                    <li>
                                      <strong>New Tasks:</strong>
                                      {obs.actionItems && obs.actionItems.length > 0 ? (
                                        <ol style={{ paddingLeft: 20, marginTop: 4, marginBottom: 0 }}>
                                          {obs.actionItems.map((task, taskIdx) => (
                                            <li key={taskIdx}>{task}</li>
                                          ))}
                                        </ol>
                                      ) : (
                                        <span className="muted"> (None)</span>
                                      )}
                                    </li>
                                  </ul>
                                </div>

                                {/* View raw report toggle */}
                                {obs.report_hash ? (
                                  <div style={{ marginTop: 12, borderTop: "1px solid var(--md-sys-color-outline-variant)", paddingTop: 12 }}>
                                    {(!rawReports[obs.report_hash] || !rawReports[obs.report_hash].text) && (
                                      <button
                                        className="btn btn-outline btn-sm"
                                        disabled={rawReports[obs.report_hash]?.loading}
                                        onClick={() => obs.report_hash && handleFetchRawReport(obs.report_hash, obs.centerName)}
                                      >
                                        {rawReports[obs.report_hash]?.loading ? (
                                          <>
                                            <span className="spin msym" style={{ fontSize: 16 }}>progress_activity</span>
                                            Loading raw text…
                                          </>
                                        ) : (
                                          <>
                                            <span className="msym">description</span> View raw report
                                          </>
                                        )}
                                      </button>
                                    )}
                                    {rawReports[obs.report_hash] && rawReports[obs.report_hash].text && (
                                      <div>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                          <strong>Raw Report Text</strong>
                                          <button
                                            className="btn btn-outline btn-xs"
                                            onClick={() => {
                                              setRawReports((prev) => {
                                                const copy = { ...prev };
                                                delete copy[obs.report_hash!];
                                                return copy;
                                              });
                                            }}
                                          >
                                            Hide
                                          </button>
                                        </div>
                                        <pre className="raw-report-pre">{rawReports[obs.report_hash].text}</pre>
                                      </div>
                                    )}
                                    {rawReports[obs.report_hash] && rawReports[obs.report_hash].error && (
                                      <div className="alert alert-error" style={{ fontSize: 12, padding: "6px 12px", margin: "8px 0 0" }}>
                                        Error loading raw report: {rawReports[obs.report_hash].error}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div style={{ marginTop: 12, fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", fontStyle: "italic" }}>
                                    Raw text not available (saved before this feature).
                                  </div>
                                )}

                                {/* Delete controls and Edit button */}
                                <div
                                  className="timeline-delete-row"
                                  style={{ position: "relative", marginTop: 12, display: "flex", gap: "8px", flexWrap: "wrap" }}
                                >
                                  <button
                                    className="btn btn-tonal btn-sm"
                                    onClick={() => handleStartEdit(obs)}
                                  >
                                    <span className="msym" style={{ fontSize: 16 }}>
                                      edit
                                    </span>
                                    Edit
                                  </button>

                                  <button
                                    className="btn btn-danger btn-sm"
                                    onClick={() =>
                                      setDeleteConfirm(
                                        deleteConfirm?.idx === idx
                                          ? null
                                          : { idx, obs },
                                      )
                                    }
                                  >
                                    <span className="msym" style={{ fontSize: 16 }}>
                                      delete
                                    </span>
                                    Delete
                                  </button>

                                  {deleteConfirm?.idx === idx && (
                                    <div className="delete-popover">
                                      <p style={{ margin: "0 0 10px", fontWeight: 600, color: "var(--md-sys-color-error)" }}>
                                        <span className="msym">warning</span> Delete Observation
                                      </p>
                                      <p style={{ margin: "0 0 6px", fontSize: 13 }}>
                                        <strong>Date:</strong> {fmtDate(obs.date)}
                                      </p>
                                      <p style={{ margin: "0 0 14px", fontSize: 13 }}>
                                        <strong>Report:</strong>{" "}
                                        {obs.reportTitle ?? ""}
                                      </p>
                                      <div className="row gap-8">
                                        <button
                                          className="btn btn-outline btn-sm grow"
                                          onClick={() =>
                                            handleDeleteObs(obs, "single")
                                          }
                                        >
                                          This child only
                                        </button>
                                        <button
                                          className="btn btn-danger btn-sm grow"
                                          onClick={() =>
                                            handleDeleteObs(obs, "all")
                                          }
                                        >
                                          All children
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </CollapsibleSection>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
      {/* ── Floating Q&A Child Assistant ── */}
      {selectedKid && kidDoc && (
        <>
          <button
            className="assistant-fab"
            onClick={() => setAssistantOpen((o) => !o)}
            title="Ask a question about this child"
          >
            {assistantOpen ? (
              <span className="msym">close</span>
            ) : (
              <span style={{ fontWeight: "bold", fontSize: "2.4rem", lineHeight: 1 }}>?</span>
            )}
          </button>




          {assistantOpen && (
            <div className="assistant-panel">
              <div className="assistant-header">
                <div>
                  <div className="assistant-header-title">
                    <span className="msym" style={{ color: "var(--md-sys-color-primary)" }}>psychology</span>
                    <span>Child Counseling Assistant</span>
                  </div>
                  <div className="assistant-header-subtitle">
                    Scoped to <strong>{kidDoc.child_name}</strong>
                  </div>
                </div>
                <button
                  className="assistant-close-btn"
                  onClick={() => setAssistantOpen(false)}
                >
                  <span className="msym">close</span>
                </button>
              </div>

              <div className="chat-messages">
                {chatHistory.length === 0 ? (
                  <div className="chat-placeholder">
                    <span className="msym">chat</span>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>
                      Ask me anything about {kidDoc.child_name}'s profiles and observations!
                    </p>
                    <p className="muted" style={{ margin: 0, fontSize: 11 }}>
                      Example: "Any behavioral concerns?" or "What are their strengths?"
                    </p>
                  </div>
                ) : (
                  chatHistory.map((msg, index) => (
                    <div
                      key={index}
                      className={`chat-bubble ${msg.sender}`}
                    >
                      {msg.text}
                    </div>
                  ))
                )}
                {chatLoading && (
                  <div className="chat-bubble ai" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="spin msym" style={{ fontSize: 16 }}>progress_activity</span>
                    Thinking…
                  </div>
                )}
              </div>

              {/* Suggestion Chips */}
              <div className="suggestion-chips">
                <button
                  className="suggestion-chip"
                  onClick={() => handleSendQuestion("What are the recurring themes in the logs?")}
                  disabled={chatLoading}
                >
                  <span className="msym">psychology</span> Recurring Themes
                 </button>
                <button
                  className="suggestion-chip"
                  onClick={() => handleSendQuestion("Summarize the progress or regression of the child.")}
                  disabled={chatLoading}
                >
                  <span className="msym">trending_up</span> Progress Summary
                 </button>
                <button
                  className="suggestion-chip"
                  onClick={() => handleSendQuestion("What are the key counselor focus areas?")}
                  disabled={chatLoading}
                >
                  <span className="msym">target</span> Focus Areas
                 </button>
              </div>

              <div className="chat-input-row">
                <input
                  className="chat-input"
                  placeholder="Ask a question..."
                  value={assistantInput}
                  onChange={(e) => setAssistantInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !chatLoading) {
                      handleSendQuestion(assistantInput);
                    }
                  }}
                  disabled={chatLoading}
                />
                <button
                  className="chat-send-btn"
                  onClick={() => handleSendQuestion(assistantInput)}
                  disabled={chatLoading || !assistantInput.trim()}
                >
                  <span className="msym">send</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )}
</>
)}
    </>
  );
}
