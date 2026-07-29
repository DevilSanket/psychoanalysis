/**
 * utils.ts — small shared helpers (dates, downloads, CSV safety).
 */

/** Format an ISO date string as "04 Jul 2026" (en-IN). */
export function fmtDate(d: string | undefined | null): string {
  if (!d) return "—";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d.slice(0, 10);
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Trigger a client-side file download. */
export function downloadBlob(data: string, filename: string, mime: string) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Escape a value for a CSV cell.
 * - Doubles inner quotes.
 * - Neutralises spreadsheet formula injection (=, +, -, @, tab/CR prefixes)
 *   by prefixing a single quote, per OWASP guidance.
 */
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Build a CSV string from a header row + data rows, all safely escaped. */
export function buildCsv(header: string[], rows: unknown[][]): string {
  const head = header.map(csvCell).join(",");
  const body = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  return `${head}\n${body}`;
}

/** Sanitise a string for use in a filename. */
export function safeFilename(s: string): string {
  return s.replace(/[^\w\d-]+/g, "_").replace(/^_+|_+$/g, "") || "export";
}

/** Simple debounce that returns a cancelable function. */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): ((...args: A) => void) & { cancel: () => void } {
  let t: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => {
    if (t) clearTimeout(t);
  };
  return wrapped;
}

/** Generate a stable unique id (crypto.randomUUID with fallback). */
export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
