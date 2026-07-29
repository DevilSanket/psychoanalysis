import { useCallback, useEffect, useRef, useState } from "react";
import "./components.css";

import {
  fetchHealth,
  type HealthStatus,
  type MatchedChild,
  type ExtractResponse,
  type SaveResult,
} from "./api";
import type { Meta } from "./types";
import ReportInput from "./components/ReportInput";
import ReviewProfiles from "./components/ReviewProfiles";
import SaveComplete from "./components/SaveComplete";
import RosterInsights from "./components/RosterInsights";
import AdminPanel from "./components/AdminPanel";
import { useToast } from "./toast";

type Tab = "parser" | "insights" | "admin";
type Step = "input" | "review" | "done";

const SESSION_KEY = "isf-parser-session-v1";
const HEALTH_POLL_MS = 30_000;

interface PersistedSession {
  step: Step;
  matched: MatchedChild[];
  meta: Meta | null;
  saveResults: SaveResult[];
}

function loadSession(): PersistedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSession;
    if (parsed.step === "review" && (!parsed.meta || !parsed.matched?.length)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function App() {
  const toast = useToast();
  const restored = useRef<PersistedSession | null>(loadSession());

  const [tab, setTab] = useState<Tab>("parser");
  const [step, setStep] = useState<Step>(restored.current?.step ?? "input");
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthFailed, setHealthFailed] = useState(false);

  // Cross-component navigation state (Admin Panel → Roster/Insights child profile)
  const [selectedCenterName, setSelectedCenterName] = useState<string | undefined>(undefined);
  const [selectedChildName, setSelectedChildName] = useState<string | undefined>(undefined);

  // Parser flow state (restored from sessionStorage after a refresh)
  const [matched, setMatched] = useState<MatchedChild[]>(
    restored.current?.matched ?? [],
  );
  const [meta, setMeta] = useState<Meta | null>(restored.current?.meta ?? null);
  const [saveResults, setSaveResults] = useState<SaveResult[]>(
    restored.current?.saveResults ?? [],
  );

  // Announce a successful restore once
  useEffect(() => {
    if (restored.current && restored.current.step !== "input") {
      toast.info("Restored your in-progress report from this browser session.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist parser flow so a refresh doesn't lose work
  useEffect(() => {
    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ step, matched, meta, saveResults }),
      );
    } catch {
      /* storage full/unavailable — non-fatal */
    }
  }, [step, matched, meta, saveResults]);

  // Warn before leaving mid-review
  useEffect(() => {
    if (step !== "review") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [step]);

  // Health check with polling + retry
  const checkHealth = useCallback(() => {
    fetchHealth()
      .then((h) => {
        setHealth(h);
        setHealthFailed(false);
      })
      .catch(() => {
        setHealth(null);
        setHealthFailed(true);
      });
  }, []);

  useEffect(() => {
    checkHealth();
    const timer = setInterval(checkHealth, HEALTH_POLL_MS);
    return () => clearInterval(timer);
  }, [checkHealth]);

  const handleExtracted = (result: ExtractResponse, m: Meta) => {
    setMatched(result.matched_children);
    setMeta(m);
    setStep("review");
  };

  const handleSaved = (
    results: SaveResult[],
    m: Meta,
    children: MatchedChild[],
  ) => {
    setSaveResults(results);
    setMeta(m);
    setMatched(children);
    setStep("done");
  };

  const handleReset = () => {
    setMatched([]);
    setMeta(null);
    setSaveResults([]);
    setStep("input");
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  };

  const mongoDown = health !== null && !health.mongo;

  return (
    <div className="app-shell">
      {/* Header bar */}
      <header className="header-bar">
        <div className="logo">
          <span className="msym logo-icon" aria-hidden="true">psychology</span>
          ISF · Psycho-Analysis Portal
        </div>
        <div className="status-badges">
          {health ? (
            <>
              <span
                className={`badge ${health.mongo ? "badge-success" : "badge-error"}`}
                title={health.mongo ? "Database connected" : "Database unreachable"}
              >
                <span className="msym badge-msym" aria-hidden="true">
                  {health.mongo ? "database" : "database_off"}
                </span>
                MongoDB
              </span>
            </>
          ) : healthFailed ? (
            <button className="badge badge-error badge-btn" onClick={checkHealth}>
              <span className="msym badge-msym" aria-hidden="true">sync_problem</span>
              Backend offline — retry
            </button>
          ) : (
            <span className="badge badge-neutral">
              <span className="msym badge-msym spin" aria-hidden="true">
                progress_activity
              </span>
              Connecting…
            </span>
          )}
        </div>
      </header>

      {mongoDown && (
        <div className="alert alert-error" role="alert">
          <span className="msym" aria-hidden="true">database_off</span>
          MongoDB is unreachable — saving is disabled until the connection
          recovers. Retrying automatically…
        </div>
      )}

{/* Tab bar */}
      <nav className="tab-bar" role="tablist" aria-label="Main sections">
        <button
          role="tab"
          aria-selected={tab === "parser"}
          className={`tab-btn${tab === "parser" ? " active" : ""}`}
          onClick={() => setTab("parser")}
        >
          <span className="msym" aria-hidden="true">edit_note</span>
          Share Your Day
          {step === "review" && tab !== "parser" && (
            <span className="tab-dot" title="Review in progress" />
          )}
        </button>
        <button
          role="tab"
          aria-selected={tab === "insights"}
          className={`tab-btn${tab === "insights" ? " active" : ""}`}
          onClick={() => setTab("insights")}
        >
          <span className="msym" aria-hidden="true">monitoring</span>
          Evaluation / InnerMap
        </button>

        <button
          role="tab"
          aria-selected={tab === "admin"}
          className={`tab-btn${tab === "admin" ? " active" : ""}`}
          onClick={() => setTab("admin")}
        >
          <span className="msym" aria-hidden="true">admin_panel_settings</span>
          Admin Panel
        </button>
      </nav>

      {/* Content */}
      {tab === "parser" && (
        <div className="glass page-pad">
          {step === "input" && <ReportInput onExtracted={handleExtracted} />}
          {step === "review" && meta && (
            <ReviewProfiles
              initial={matched}
              meta={meta}
              mongoDown={mongoDown}
              onBack={() => setStep("input")}
              onSaved={handleSaved}
            />
          )}
          {step === "done" && meta && (
            <SaveComplete
              results={saveResults}
              meta={meta}
              children={matched}
              onReset={handleReset}
            />
          )}
        </div>
      )}

      {tab === "insights" && (
        <div className="glass page-pad">
          <RosterInsights
            initialCenter={selectedCenterName}
            initialChildName={selectedChildName}
          />
        </div>
      )}

      {tab === "admin" && (
        <div className="glass page-pad">
          <AdminPanel
            onClose={() => setTab("parser")}
            onSelectChild={(childName, balgruhaName) => {
              setSelectedCenterName(balgruhaName);
              setSelectedChildName(childName);
              setTab("insights");
            }}
            onSelectCenter={(balgruhaName) => {
              setSelectedCenterName(balgruhaName);
              setSelectedChildName(undefined);
              setTab("insights");
            }}
          />
        </div>
      )}

      <footer className="app-footer muted">
        ISF Child Psycho-Analysis Portal · Gemini-powered extraction ·
        Data stays in your MongoDB
      </footer>
    </div>
  );
}

export default App;
