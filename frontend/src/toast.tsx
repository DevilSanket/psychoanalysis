/**
 * toast.tsx — lightweight snackbar/toast system.
 * Wrap the app in <ToastProvider>; call useToast().push(...) anywhere.
 * Supports an optional action button (used for "Undo" flows).
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { uid } from "./utils";

export type ToastKind = "success" | "error" | "info" | "warning";

export interface ToastOptions {
  kind?: ToastKind;
  message: string;
  /** Optional action button label, e.g. "Undo". */
  actionLabel?: string;
  onAction?: () => void;
  /** Auto-dismiss ms (default 5000; errors 8000). 0 = sticky. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: string;
  kind: ToastKind;
}

interface ToastContextValue {
  push: (opts: ToastOptions) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const KIND_ICON: Record<ToastKind, string> = {
  success: "check_circle",
  error: "error",
  info: "info",
  warning: "warning",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (opts: ToastOptions) => {
      const id = uid();
      const kind = opts.kind ?? "info";
      const duration = opts.duration ?? (kind === "error" ? 8000 : 5000);
      setToasts((prev) => [...prev.slice(-3), { ...opts, id, kind }]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
    },
    [dismiss],
  );

  const value: ToastContextValue = {
    push,
    success: (message) => push({ kind: "success", message }),
    error: (message) => push({ kind: "error", message }),
    info: (message) => push({ kind: "info", message }),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="region" aria-label="Notifications">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.kind}`}
            role={t.kind === "error" ? "alert" : "status"}
          >
            <span className="msym toast-icon" aria-hidden="true">
              {KIND_ICON[t.kind]}
            </span>
            <span className="toast-message">{t.message}</span>
            {t.actionLabel && (
              <button
                className="toast-action"
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
              >
                {t.actionLabel}
              </button>
            )}
            <button
              className="toast-close"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
            >
              <span className="msym" aria-hidden="true">close</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
