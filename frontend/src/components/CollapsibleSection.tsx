import { useState, type ReactNode } from "react";

interface Props {
  /** Button label, e.g. "AI Summary of All Reports" or a report date. */
  title: string;
  /** Material Symbols icon name (rendered with the existing .msym class). */
  icon?: string;
  /** Optional emoji prefix (used where the app already uses emoji). */
  emoji?: string;
  /** Small secondary text next to the title (e.g. report title under a date). */
  subtitle?: string;
  /** Optional count badge, e.g. number of pending tasks. */
  badge?: number | string;
  /**
   * Called the FIRST time the section is expanded — use for lazy fetching
   * (e.g. only generate the AI summary when the user actually clicks).
   */
  onFirstOpen?: () => void;
  /** Visual variant: "primary" highlights the button (AI summary). */
  variant?: "default" | "primary";
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * CollapsibleSection — the standard "details visible only on click" building
 * block for the child detail view (Roster & Insights tab).
 *
 * Review feedback (Sandhya, 6 Jul 2026): all sections below the static
 * profile data must be collapsed buttons; content shows only on click.
 */
export default function CollapsibleSection({
  title,
  icon,
  emoji,
  subtitle,
  badge,
  onFirstOpen,
  variant = "default",
  defaultOpen = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [everOpened, setEverOpened] = useState(defaultOpen);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !everOpened) {
      setEverOpened(true);
      onFirstOpen?.();
    }
  };

  return (
    <div
      className={`collapse-section glass${open ? " open" : ""}`}
      style={{ position: "relative", zIndex: open ? 10 : 1 }}
    >
      <button
        type="button"
        className={`collapse-header${variant === "primary" ? " collapse-primary" : ""}`}
        onClick={toggle}
        aria-expanded={open}
      >
        <span className="collapse-title">
          {icon && <span className="msym">{icon}</span>}
          {emoji && <span className="collapse-emoji">{emoji}</span>}
          <span>
            {title}
            {subtitle && <span className="collapse-subtitle">{subtitle}</span>}
          </span>
        </span>
        <span className="collapse-meta">
          {badge !== undefined && badge !== null && badge !== 0 && (
            <span className="collapse-badge">{badge}</span>
          )}
          <span className={`msym collapse-chevron${open ? " rotated" : ""}`}>
            expand_more
          </span>
        </span>
      </button>
      {open && <div className="collapse-body">{children}</div>}
    </div>
  );
}
