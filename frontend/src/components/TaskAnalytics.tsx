import { useState, useEffect } from "react";
import {
  fetchTaskAnalytics,
  toggleChildTask,
  type TaskAnalyticsResponse,
  type DetailedTask,
} from "../api";
import { useToast } from "../toast";

interface TaskAnalyticsProps {
  onSelectChild?: (childName: string, balgruhaName: string) => void;
}

export default function TaskAnalytics({ onSelectChild }: TaskAnalyticsProps) {
  const toast = useToast();
  const [data, setData] = useState<TaskAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [statusTab, setStatusTab] = useState<"all" | "pending" | "completed">("all");
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchTaskAnalytics();
      setData(res);
    } catch (err: any) {
      setError(err?.message || "Failed to load task analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleTask = async (task: DetailedTask) => {
    setTogglingTaskId(task.id);
    const nextCompleted = !Boolean(task.is_completed || task.status === "completed");
    try {
      await toggleChildTask(task.child_id, task.task, nextCompleted);
      toast.success(
        nextCompleted
          ? `Marked task as completed!`
          : `Re-opened task for ${task.child_name}`
      );
      // Optimistically update local task state
      setData((prev) => {
        if (!prev) return prev;
        const updatedTasks = prev.tasks.map((t) => {
          if (t.id === task.id || (t.child_id === task.child_id && t.task === task.task)) {
            return {
              ...t,
              is_completed: nextCompleted,
              status: nextCompleted ? "completed" : "pending",
              is_overdue: nextCompleted ? false : t.is_overdue,
            };
          }
          return t;
        });

        const pendingCount = updatedTasks.filter((t) => !t.is_completed && t.status !== "completed").length;
        const completedCount = updatedTasks.filter((t) => t.is_completed || t.status === "completed").length;
        const overdueCount = updatedTasks.filter((t) => (!t.is_completed && t.status !== "completed") && t.is_overdue).length;

        return {
          ...prev,
          metrics: {
            ...prev.metrics,
            current_pending: pendingCount,
            completed: completedCount,
            overdue: overdueCount,
          },
          tasks: updatedTasks,
        };
      });
    } catch (err: any) {
      toast.error("Failed to update task: " + (err?.message || String(err)));
    } finally {
      setTogglingTaskId(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <div className="spinner" style={{ margin: "0 auto 16px" }} />
        <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
          Aggregating pending tasks and completion analytics...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: "24px", textAlign: "center" }} className="card">
        <p style={{ color: "var(--accent-red)", marginBottom: "12px" }}>
          ⚠️ {error || "Failed to load task analytics"}
        </p>
        <button onClick={loadData} className="btn btn-secondary">
          Retry Loading
        </button>
      </div>
    );
  }

  const { metrics, categories, tasks } = data;
  const categoryList = ["All", "Aadhar", "Medical", "Counselling", "School", "Art Therapy"];

  const filteredTasks = tasks.filter((t) => {
    const isComp = Boolean(t.is_completed || t.status === "completed");
    if (statusTab === "pending" && isComp) return false;
    if (statusTab === "completed" && !isComp) return false;

    if (selectedCategory === "All") return true;
    return t.category.toLowerCase() === selectedCategory.toLowerCase();
  });

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
          background: "linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)",
          borderRadius: "16px",
          border: "1px solid #fef08a",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 700, color: "var(--md-sys-color-on-surface, #020617)" }}>
            📊 Pending Task Analytics
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--md-sys-color-on-surface-variant, #475569)" }}>
            Tracking action items, completion times, and overdue tasks across all Balgruhas. Click checkboxes to mark tasks completed!
          </p>
        </div>

        <div style={{ padding: "8px 16px", borderRadius: "20px", background: "#fef3c7", color: "#b45309", fontWeight: 700, fontSize: "0.85rem" }}>
          🏢 Most Delayed Balgruh: <strong>{metrics.most_delayed_balgruh}</strong>
        </div>
      </div>

      {/* 5 Key Metrics Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "14px" }}>
        <div style={{ padding: "16px", borderRadius: "14px", background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.78rem", color: "var(--md-sys-color-on-surface-variant, #475569)", fontWeight: 600 }}>Current Pending</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#d97706", marginTop: "4px" }}>{metrics.current_pending}</div>
        </div>

        <div style={{ padding: "16px", borderRadius: "14px", background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.78rem", color: "var(--md-sys-color-on-surface-variant, #475569)", fontWeight: 600 }}>Completed Tasks</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#16a34a", marginTop: "4px" }}>{metrics.completed}</div>
        </div>

        <div style={{ padding: "16px", borderRadius: "14px", background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.78rem", color: "var(--md-sys-color-on-surface-variant, #475569)", fontWeight: 600 }}>Overdue (&gt;15 days)</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#dc2626", marginTop: "4px" }}>{metrics.overdue}</div>
        </div>

        <div style={{ padding: "16px", borderRadius: "14px", background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.78rem", color: "var(--md-sys-color-on-surface-variant, #475569)", fontWeight: 600 }}>Avg Completion Days</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#0284c7", marginTop: "4px" }}>{metrics.avg_completion_days}d</div>
        </div>

        <div style={{ padding: "16px", borderRadius: "14px", background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.78rem", color: "var(--md-sys-color-on-surface-variant, #475569)", fontWeight: 600 }}>Pending &gt; 15 Days</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#dc2626", marginTop: "4px" }}>{metrics.tasks_pending_over_15_days}</div>
        </div>
      </div>

      {/* Status Filter Tabs (All / Pending / Completed) */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "4px", background: "#f1f5f9", padding: "4px", borderRadius: "12px" }}>
          <button
            className={`btn-sm ${statusTab === "all" ? "btn-primary" : ""}`}
            style={{ borderRadius: "8px", border: "none", padding: "6px 14px", cursor: "pointer", fontWeight: 600, fontSize: "0.8rem", background: statusTab === "all" ? "var(--md-sys-color-primary, #0369a1)" : "transparent", color: statusTab === "all" ? "#fff" : "#475569" }}
            onClick={() => setStatusTab("all")}
          >
            All Tasks ({tasks.length})
          </button>
          <button
            className={`btn-sm ${statusTab === "pending" ? "btn-primary" : ""}`}
            style={{ borderRadius: "8px", border: "none", padding: "6px 14px", cursor: "pointer", fontWeight: 600, fontSize: "0.8rem", background: statusTab === "pending" ? "#d97706" : "transparent", color: statusTab === "pending" ? "#fff" : "#475569" }}
            onClick={() => setStatusTab("pending")}
          >
            ⏳ Pending ({metrics.current_pending})
          </button>
          <button
            className={`btn-sm ${statusTab === "completed" ? "btn-primary" : ""}`}
            style={{ borderRadius: "8px", border: "none", padding: "6px 14px", cursor: "pointer", fontWeight: 600, fontSize: "0.8rem", background: statusTab === "completed" ? "#16a34a" : "transparent", color: statusTab === "completed" ? "#fff" : "#475569" }}
            onClick={() => setStatusTab("completed")}
          >
            ✅ Completed ({metrics.completed})
          </button>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px" }}>
        {categoryList.map((cat) => {
          const count = cat === "All" ? tasks.length : categories[cat] || 0;
          const isSelected = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: "8px 16px",
                borderRadius: "20px",
                border: isSelected ? "none" : "1px solid #cbd5e1",
                background: isSelected ? "var(--md-sys-color-primary, #0369a1)" : "#ffffff",
                color: isSelected ? "#ffffff" : "var(--md-sys-color-on-surface-variant, #475569)",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>{cat}</span>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "10px",
                  background: isSelected ? "rgba(255,255,255,0.2)" : "#f1f5f9",
                  fontSize: "0.75rem",
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Detailed Tasks List / Table */}
      <div
        style={{
          borderRadius: "16px",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          overflow: "hidden",
        }}
      >
        {filteredTasks.length === 0 ? (
          <p style={{ padding: "30px", textAlign: "center", color: "var(--md-sys-color-on-surface-variant, #475569)", fontStyle: "italic" }}>
            No tasks found for category "{selectedCategory}" ({statusTab}).
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc", color: "var(--md-sys-color-on-surface-variant, #475569)", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "12px 16px", width: "60px", textAlign: "center" }}>Mark</th>
                  <th style={{ padding: "12px 16px" }}>Task / Action Item</th>
                  <th style={{ padding: "12px 16px" }}>Category</th>
                  <th style={{ padding: "12px 16px" }}>Child</th>
                  <th style={{ padding: "12px 16px" }}>Balgruha</th>
                  <th style={{ padding: "12px 16px" }}>Recorded Date</th>
                  <th style={{ padding: "12px 16px" }}>Status / Days</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((t, idx) => {
                  const isComp = Boolean(t.is_completed || t.status === "completed");
                  return (
                    <tr key={t.id || idx} style={{ borderBottom: "1px solid #f1f5f9", background: isComp ? "#f8fafc" : "transparent" }}>
                      <td style={{ padding: "12px 16px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "#16a34a" }}
                          checked={isComp}
                          onChange={() => handleToggleTask(t)}
                          disabled={togglingTaskId === t.id}
                          title={isComp ? "Click to mark as pending" : "Click to mark as completed"}
                        />
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontWeight: 600,
                          color: isComp ? "#94a3b8" : "var(--md-sys-color-on-surface, #020617)",
                          textDecoration: isComp ? "line-through" : "none",
                        }}
                      >
                        {t.task}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: "8px",
                            background: isComp ? "#f1f5f9" : "#e0f2fe",
                            color: isComp ? "#64748b" : "#0369a1",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                          }}
                        >
                          {t.category}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            color: "var(--md-sys-color-primary, #0369a1)",
                            fontWeight: 600,
                            cursor: onSelectChild ? "pointer" : "default",
                          }}
                          onClick={() => onSelectChild && onSelectChild(t.child_name, t.balgruha_name)}
                        >
                          {t.child_name}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--md-sys-color-on-surface-variant, #475569)" }}>{t.balgruha_name}</td>
                      <td style={{ padding: "12px 16px", color: "var(--md-sys-color-on-surface-variant, #475569)" }}>{t.date}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            padding: "3px 10px",
                            borderRadius: "10px",
                            fontSize: "0.78rem",
                            fontWeight: 700,
                            background: isComp ? "#dcfce7" : t.is_overdue ? "#fee2e2" : "#fef3c7",
                            color: isComp ? "#15803d" : t.is_overdue ? "#dc2626" : "#b45309",
                          }}
                        >
                          {isComp ? "✅ Completed" : t.is_overdue ? `🚨 Overdue (${t.days_pending}d)` : `⏳ ${t.days_pending} days pending`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
