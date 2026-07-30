/**
 * api.ts — typed fetch wrappers for the FastAPI backend.
 * In dev the Vite proxy (vite.config.ts) forwards /api → localhost:8000.
 *
 * All helpers share `request()`, which adds:
 *   - a default timeout (so a hung backend can't freeze the UI forever)
 *   - optional caller AbortSignal (cancel buttons)
 *   - friendly error messages extracted from FastAPI `detail` payloads
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface HealthStatus {
  mongo: boolean;
}

export interface Center {
  id: string;
  name: string;
}

export interface RosterStats {
  total_children: number;
  total_observations: number;
  active_coaches: number;
}

export interface RosterResponse {
  children: ChildDoc[];
  stats: RosterStats;
}

export interface ChildDoc {
  _id: string;
  child_name: string;
  balgruha_name?: string;
  photo_url?: string;
  class_studying?: string;
  dob?: string;
  school?: string;
  parent_status?: string;
  languages?: string;
  strengths?: string;
  weakness?: string;
  nature_behavior?: string;
  nature?: string;
  gender?: string;
  trauma_category?: string;
  risk_category?: string;
  observations?: Observation[];
}

export interface Observation {
  date: string;
  reportTitle?: string;
  centerName?: string;
  generalBackground?: string;
  psychologistName?: string;
  testsDone?: string;
  observations?: string;
  followUp?: string;
  psychologicalNotes?: string;
  actionItems?: string[];
  coachesInvolved?: string[];
  /** Joins the observation to the reports registry (raw text). Absent on old data. */
  report_hash?: string;
}

/** Response of GET /api/children/{id}/summary — AI summary of all reports. */
export interface ChildSummaryResponse {
  summary: string;
  generated_at: string | null;
  cached: boolean;
  observation_count: number;
}

/** Response of POST /api/children/{id}/summary/translate — Hindi translation of the AI summary. */
export interface TranslatedSummaryResponse {
  translated: string;
  lang: string;
  cached: boolean;
  generated_at: string | null;
  observation_count: number;
}

/** Response of GET /api/children/{id}/pending-tasks — AI-consolidated, de-duplicated action items. */
export interface PendingTasksResponse {
  tasks: string[];
  cached: boolean;
  generated_at: string | null;
  observation_count: number;
  observation_count_with_tasks: number;
}

export interface TranslatedTasksResponse {
  translated: string[];
  lang: string;
  cached: boolean;
  generated_at: string | null;
  observation_count: number;
}


/** Response of GET /api/reports/{hash} — original raw report text. */
export interface RawReportResponse {
  report_title: string;
  report_date: string;
  center_name: string;
  coaches: string[];
  raw_report: string;
  has_raw: boolean;
}

export type MatchType =
  | "exact"
  | "high"
  | "medium"
  | "none"
  | "fuzzy_suggested"
  | "created";

export interface Candidate {
  child_name: string;
  db_id: string;
  score: number;
  class_studying?: string;
}

export interface MatchedChild {
  name: string;
  matched: boolean;
  match_type: MatchType;
  match_score: number;
  db_id?: string;
  db_name?: string;
  profile?: Record<string, string>;
  generalBackground?: string;
  psychologistName?: string;
  testsDone?: string;
  observations?: string;
  followUp?: string;
  psychologicalNotes?: string;
  actionItems?: string[];
  candidates?: Candidate[];
  /** Psychologist-selected risk/observation category for this session. */
  risk_category?: string;
}

export interface ExtractRequest {
  raw_report: string;
  report_title: string;
  report_date: string;
  coaches: string[];
  center_id?: string;
  center_name?: string;
  force?: boolean;
}

export interface ExtractResponse {
  identified_names: string[];
  matched_children: MatchedChild[];
  extracted_center_name?: string;
  extracted_center_id?: string;
  extracted_report_title?: string;
  extracted_report_date?: string;
  extracted_coaches?: string[];
  error: string | null;
}


export interface SaveRequest {
  report_title: string;
  report_date: string;
  coaches: string[];
  center_id?: string;
  center_name?: string;
  matched_children: MatchedChild[];
  /** Raw report text — the backend fingerprints it to reject duplicates (HTTP 409). */
  raw_report?: string;
  /** Override the duplicate guard ("Save anyway"). */
  force?: boolean;
}

export interface SaveResult {
  name: string;
  success: boolean;
  reason?: string;
}

export interface RematchRequest {
  name: string;
  center_name?: string;
}

export interface ConfirmMatchRequest {
  db_id: string;
  name: string;
  score?: number;
}

export interface CreateChildRequest {
  child_name: string;
  balgruha_name: string;
  class_studying?: string;
  dob?: string;
  school?: string;
  parent_status?: string;
  languages?: string;
  strengths?: string;
  weakness?: string;
  nature_behavior?: string;
  extracted_name?: string;
}

export interface FileExtractResponse {
  filename: string;
  text: string;
  chars: number;
}

/* ------------------------------------------------------------------ */
/*  Core request helper                                                */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

interface RequestOpts {
  /** Abort from the caller (e.g. a Cancel button). */
  signal?: AbortSignal;
  /** Milliseconds before the request is aborted. Default 30s. */
  timeoutMs?: number;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: RequestOpts = {},
): Promise<T> {
  const { signal, timeoutMs = 30_000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  const onCallerAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onCallerAbort, { once: true });
  if (signal?.aborted) controller.abort(signal.reason);

  try {
    const res = await fetch(path, { ...init, signal: controller.signal });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        detail = body?.detail ?? JSON.stringify(body);
      } catch {
        detail = (await res.text().catch(() => "")) || res.statusText;
      }
      throw new ApiError(res.status, detail);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new ApiError(0, "The server took too long to respond. Please try again.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onCallerAbort);
  }
}

const post = <T,>(path: string, body: unknown, opts?: RequestOpts) =>
  request<T>(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    opts,
  );

/* ------------------------------------------------------------------ */
/*  Endpoints                                                          */
/* ------------------------------------------------------------------ */

export const fetchHealth = () =>
  request<HealthStatus>("/api/health", {}, { timeoutMs: 8_000 });

export const fetchCenters = () => request<Center[]>("/api/centers");

export const fetchRoster = (centerName: string) =>
  request<RosterResponse>(
    `/api/centers/${encodeURIComponent(centerName)}/roster`,
  );

export const searchChildren = (
  centerName: string,
  q: string,
  signal?: AbortSignal,
) =>
  request<Candidate[]>(
    `/api/centers/${encodeURIComponent(centerName)}/search?q=${encodeURIComponent(q)}`,
    {},
    { signal, timeoutMs: 10_000 },
  );

/**
 * Infer gender (male/female/unknown) for a batch of Indian child names using
 * Gemini in a single call. Optionally persists the result back to MongoDB.
 */
export const inferGenders = (
  names: string[],
  childIds: string[] = [],
) =>
  post<{ genders: string[] }>(
    "/api/infer-genders",
    { names, child_ids: childIds },
    { timeoutMs: 60_000 },
  );


export const extractReport = (body: ExtractRequest, signal?: AbortSignal) =>
  post<ExtractResponse>("/api/extract", body, { signal, timeoutMs: 120_000 });

export const saveObservations = (body: SaveRequest) =>
  post<{ save_results: SaveResult[] }>("/api/save", body, {
    timeoutMs: 60_000,
  });

export const rematchChild = (body: RematchRequest) =>
  post<{ entry: MatchedChild | null; score: number }>("/api/rematch", body);

export const confirmMatch = (body: ConfirmMatchRequest) =>
  post<{ entry: MatchedChild }>("/api/confirm-match", body);

export const createChild = (body: CreateChildRequest) =>
  post<{ entry: MatchedChild }>("/api/children", body);

export const extractFileText = (file: File, signal?: AbortSignal) => {
  const form = new FormData();
  form.append("file", file);
  return request<FileExtractResponse>(
    "/api/extract-file",
    { method: "POST", body: form },
    { signal, timeoutMs: 60_000 },
  );
};

export const fetchChild = (childId: string) =>
  request<ChildDoc>(`/api/children/${childId}`);

/** Partial update of a child's basic profile fields (gender, risk_category, class, school, etc.). */
export const updateChildProfile = (
  childId: string,
  fields: Partial<Pick<ChildDoc, "gender" | "risk_category" | "class_studying" | "school" | "dob" | "parent_status" | "languages" | "strengths" | "weakness" | "nature_behavior">>,
) =>
  request<{ modified: number; message: string }>(
    `/api/children/${childId}/profile`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    },
  );



export const fetchObservations = (childId: string) =>
  request<Observation[]>(`/api/children/${childId}/observations`);

/**
 * AI summary of all of a child's reports (Gemini). Cached server-side —
 * pass refresh=true to force regeneration. Generation can be slow.
 */
export const fetchChildSummary = (childId: string, refresh = false) =>
  request<ChildSummaryResponse>(
    `/api/children/${childId}/summary${refresh ? "?refresh=true" : ""}`,
    {},
    { timeoutMs: 120_000 },
  );

/**
 * Hindi translation of the cached AI summary for a child (Gemini). Cached
 * server-side keyed on the same observation hash as the English summary, so
 * passing refresh=true forces a fresh translation only when needed.
 */
export const translateSummary = (
  childId: string,
  lang = "hi",
  refresh = false,
) =>
  request<TranslatedSummaryResponse>(
    `/api/children/${childId}/summary/translate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang, refresh }),
    },
    { timeoutMs: 120_000 },
  );

/**
 * Hindi translation of the consolidated pending tasks for a child (Gemini).
 * Cached server-side.
 */
export const translatePendingTasks = (
  childId: string,
  lang = "hi",
  refresh = false,
) =>
  request<TranslatedTasksResponse>(
    `/api/children/${childId}/pending-tasks/translate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang, refresh }),
    },
    { timeoutMs: 120_000 },
  );

/** AI-consolidated, de-duplicated pending tasks for a child (Gemini). Cached server-side. */

export const fetchDedupedTasks = (childId: string) =>
  request<PendingTasksResponse>(
    `/api/children/${childId}/pending-tasks`,
    {},
    { timeoutMs: 120_000 },
  );

/** Original raw report text by observation.report_hash (404 if not in registry). */
export const fetchRawReport = (reportHash: string, centerName?: string) =>
  request<RawReportResponse>(
    `/api/reports/${encodeURIComponent(reportHash)}${
      centerName ? `?center_name=${encodeURIComponent(centerName)}` : ""
    }`,
  );

export const deleteObservation = (
  childId: string,
  body: { date?: string; reportTitle?: string; scope: "single" | "all" },
) =>
  request<{ scope: string; modified: number }>(
    `/api/children/${childId}/observations`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

/** Editable fields allowed by the backend PATCH endpoint. */
export type EditableObsFields = Partial<
  Pick<
    Observation,
    | "psychologistName"
    | "testsDone"
    | "observations"
    | "followUp"
    | "psychologicalNotes"
    | "generalBackground"
    | "actionItems"
    | "coachesInvolved"
  >
>;

export interface UpdateObservationRequest {
  /** Preferred identifier — points at exactly one observation. */
  report_hash?: string;
  /** Fallback identifiers (for older observations without a hash). */
  date?: string;
  reportTitle?: string;
  /** Only the subset of fields to overwrite. */
  fields: EditableObsFields;
}

export const updateObservation = (
  childId: string,
  body: UpdateObservationRequest,
) =>
  request<{ modified: number; message?: string }>(
    `/api/children/${childId}/observations`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

export interface AskQuestionRequest {
  question: string;
}

export interface AskQuestionResponse {
  answer: string;
}

export const askChildQuestion = (childId: string, question: string) =>
  post<{ answer: string }>(`/api/children/${childId}/ask`, { question });

/* -------------------------------------------------------------------------- */
/*  Admin API                                                                  */
/* -------------------------------------------------------------------------- */

export interface AdminUnmatchedEntry {
  _id: string;
  extracted_name: string;
  balgruha_name: string;
  report_title: string;
  report_date: string;
  coaches: string[];
  report_hash: string;
  generalBackground: string;
  psychologistName: string;
  testsDone: string;
  observations: string;
  followUp: string;
  psychologicalNotes: string;
  actionItems: string[];
  status: "pending" | "created" | "matched" | "dismissed";
  created_at: string;
  resolved_at?: string;
  resolution?: {
    action: "created" | "matched" | "dismissed";
    child_id?: string;
    matched_child_name?: string;
    notes?: string;
    resolved_at: string;
  };
}

export interface AdminUnmatchedListResponse {
  entries: AdminUnmatchedEntry[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminResolveRequest {
  action: "create" | "match" | "dismiss";
  // For create action
  child_name?: string;
  class_studying?: string;
  dob?: string;
  school?: string;
  parent_status?: string;
  languages?: string;
  strengths?: string;
  weakness?: string;
  nature_behavior?: string;
  // For match action
  matched_child_id?: string;
  matched_child_name?: string;
  // For all actions
  notes?: string;
}

export const adminLogin = (password: string) =>
  post<{ ok: boolean; token?: string }>("/api/admin/login", { password });

const getAdminToken = () => {
  try {
    const session = sessionStorage.getItem("isf-admin-auth");
    if (!session) return "";
    return JSON.parse(session).token || "";
  } catch {
    return "";
  }
};

export const fetchAdminUnmatched = (
  status?: string,
  center?: string,
  page = 1,
  pageSize = 50,
) =>
  request<AdminUnmatchedListResponse>(
    `/api/admin/unmatched?${new URLSearchParams({
      token: getAdminToken(),
      status: status || "",
      center: center || "",
      page: String(page),
      page_size: String(pageSize),
    })}`,
  );

export const resolveAdminUnmatched = (id: string, body: AdminResolveRequest) => {
  const actionMap: Record<string, string> = {
    create: "create_new",
    match: "match_existing",
    dismiss: "dismiss"
  };
  return post<AdminUnmatchedEntry>(`/api/admin/unmatched/resolve`, {
    ...body,
    action: actionMap[body.action] || body.action,
    token: getAdminToken(),
    resolve_id: id,
    match_child_id: body.matched_child_id
  });
};

/* ------------------------------------------------------------------ */
/*  Feature 1: Risk Dashboard & Manual Profile Management API        */
/* ------------------------------------------------------------------ */

export interface RiskDashboardChild {
  _id: string;
  child_name: string;
  balgruha_name: string;
  photo_url?: string;
  risk_category: string;
  raw_risk_category: string;
  last_session_date: string;
  days_since_last_session: number | null;
  needs_psychologist_review: boolean;
  anger_increasing: boolean;
  pending_tasks_count: number;
  total_observations: number;
}

export interface RiskCategoryDetail {
  label: string;
  count: number;
  trend?: "up" | "down" | "stable";
  children?: RiskDashboardChild[];
}

export interface RiskDashboardResponse {
  categories: {
    high_risk: RiskCategoryDetail;
    trauma_unprocessed: RiskCategoryDetail;
    identity_formation: RiskCategoryDetail;
    well_adjusted: RiskCategoryDetail;
    not_yet_screened: RiskCategoryDetail;
  };
  psychologist_work_list: RiskDashboardChild[];
  total_children: number;
}

export async function fetchRiskDashboard(): Promise<RiskDashboardResponse> {
  return request<RiskDashboardResponse>("/api/admin/risk-dashboard");
}

export async function updateChildRiskProfile(
  childId: string,
  updates: {
    risk_category?: string;
    needs_psychologist_review?: boolean;
    anger_increasing?: boolean;
  }
): Promise<{ ok: boolean; child_id: string; updated: Record<string, any> }> {
  return request<{ ok: boolean; child_id: string; updated: Record<string, any> }>(
    `/api/children/${childId}/risk-profile`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    }
  );
}

/* -------------------------------------------------------------------------- */
/*  Feature 2: Children Falling Through the Cracks API                         */
/* -------------------------------------------------------------------------- */

export interface FlagReason {
  key: string;
  label: string;
  severity: "low" | "medium" | "high" | "critical";
}

export interface FlaggedChild {
  _id: string;
  child_name: string;
  balgruha_name: string;
  photo_url?: string;
  risk_category: string;
  raw_risk_category: string;
  last_session_date: string;
  days_since_last_session: number | null;
  total_observations: number;
  flag_reasons: FlagReason[];
}

export interface FallingThroughCracksResponse {
  summary: {
    never_observed: number;
    inactive_30d: number;
    no_high_risk_followup: number;
    no_coach_obs: number;
    total_flagged: number;
    total_children: number;
  };
  children: FlaggedChild[];
}

export async function fetchFallingThroughCracks(): Promise<FallingThroughCracksResponse> {
  return request<FallingThroughCracksResponse>("/api/admin/falling-through-cracks");
}

/* -------------------------------------------------------------------------- */
/*  Feature 3: Risk Heat Map of All Balgruhas API                             */
/* -------------------------------------------------------------------------- */

export interface BalgruhaHeatmapRow {
  balgruha_name: string;
  high_risk: number;
  trauma_unprocessed: number;
  identity_formation: number;
  not_yet_screened: number;
  well_adjusted: number;
  total_children: number;
  high_risk_pct: number;
}

export interface BalgruhaHeatmapResponse {
  summary: {
    total_balgruhas: number;
    total_children: number;
    highest_risk_balgruha: string;
  };
  heatmap: BalgruhaHeatmapRow[];
}

export async function fetchBalgruhaHeatmap(): Promise<BalgruhaHeatmapResponse> {
  return request<BalgruhaHeatmapResponse>("/api/admin/balgruha-heatmap");
}

/* -------------------------------------------------------------------------- */
/*  Feature 5: Pending Task Analytics API                                     */
/* -------------------------------------------------------------------------- */

export interface DetailedTask {
  id: string;
  child_id: string;
  child_name: string;
  balgruha_name: string;
  task: string;
  raw_task?: string;
  category: string;
  date: string;
  days_pending: number;
  is_overdue: boolean;
  is_completed?: boolean;
  status: string;
}

export interface TaskAnalyticsResponse {
  metrics: {
    current_pending: number;
    completed: number;
    overdue: number;
    avg_completion_days: number;
    tasks_pending_over_15_days: number;
    most_delayed_balgruh: string;
  };
  categories: Record<string, number>;
  tasks: DetailedTask[];
}

export async function fetchTaskAnalytics(): Promise<TaskAnalyticsResponse> {
  return request<TaskAnalyticsResponse>("/api/admin/task-analytics");
}

export async function toggleChildTask(
  childId: string,
  task: string,
  completed: boolean
): Promise<{ success: boolean; child_id: string; task: string; completed: boolean }> {
  return post<{ success: boolean; child_id: string; task: string; completed: boolean }>(
    `/api/children/${childId}/toggle-task`,
    { task, completed }
  );
}

export async function addQuickObservation(
  childId: string,
  payload: {
    date?: string;
    report_title?: string;
    observations: string;
    action_items?: string[];
    risk_category?: string;
  }
): Promise<{ success: boolean; message: string; child_id: string }> {
  return post<{ success: boolean; message: string; child_id: string }>(
    `/api/children/${childId}/add-observation`,
    payload
  );
}


/* -------------------------------------------------------------------------- */
/*  Feature 6: Success Stories / Recovery Page API                            */
/* -------------------------------------------------------------------------- */

export interface SuccessStoryChild {
  _id: string;
  child_name: string;
  balgruha_name: string;
  photo_url?: string;
  strengths: string;
  nature_behavior: string;
  observations_count: number;
  last_observation_date: string;
  summary: string;
}

export interface SuccessStoriesResponse {
  metrics: {
    recovered_this_month: number;
    high_risk_reduced_from: number;
    high_risk_reduced_to: number;
    reduction_text: string;
    well_adjusted_total: number;
    total_children: number;
  };
  success_stories: SuccessStoryChild[];
}

export async function fetchSuccessStories(): Promise<SuccessStoriesResponse> {
  return request<SuccessStoriesResponse>("/api/admin/success-stories");
}

/* -------------------------------------------------------------------------- */
/*  Feature 4: Child Progress Analytics (Behavioral Timeline) API             */
/* -------------------------------------------------------------------------- */

export interface BehavioralPoint {
  date: string;
  week_label: string;
  report_title: string;
  anger_control: number;
  aggression_control: number;
  social_interaction: number;
  confidence: number;
  sleep_quality: number;
  attachment: number;
  emotional_vocabulary: number;
  key_milestone: string;
}

export interface BehavioralTimelineResponse {
  child_id: string;
  child_name: string;
  timeline: BehavioralPoint[];
  cached: boolean;
}

export async function fetchBehavioralTimeline(
  childId: string,
  refresh = false
): Promise<BehavioralTimelineResponse> {
  return request<BehavioralTimelineResponse>(
    `/api/children/${childId}/behavioral-timeline${refresh ? "?refresh=true" : ""}`,
    {},
    { timeoutMs: 90_000 }
  );
}

