import { useEffect, useRef, useState } from "react";
import { ListChecks, RotateCcw } from "lucide-react";
import Tooltip from "@/components/ui/Tooltip";
import {
  ACTIVITY_FILTERS,
  ACTIVITY_MODES,
  DEFAULT_ACTIVITY_FILTERS,
  type ActivityCategory,
  type ActivityMode,
} from "./activityStream";

interface ActivityStreamControlsProps {
  mode: ActivityMode;
  filters: readonly ActivityCategory[];
  eventCount: number;
  onModeChange: (mode: ActivityMode) => void;
  onFiltersChange: (filters: ActivityCategory[]) => void;
}

export default function ActivityStreamControls({
  mode,
  filters,
  eventCount,
  onModeChange,
  onFiltersChange,
}: ActivityStreamControlsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const currentMode = ACTIVITY_MODES.find(({ id }) => id === mode)!;
  const options = ACTIVITY_FILTERS[mode];

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => setMenuOpen(false), [mode]);

  const toggle = (category: ActivityCategory) => {
    onFiltersChange(
      filters.includes(category)
        ? filters.filter((selected) => selected !== category)
        : [...filters, category],
    );
  };

  return (
    <div className="border-b border-brand/15 bg-surface-light">
      <div
        role="tablist"
        aria-label="Activity views"
        className="grid grid-cols-3 border-b border-brand/10 px-1 pt-1"
      >
        {ACTIVITY_MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={mode === item.id}
            onClick={() => onModeChange(item.id)}
            className={`min-h-11 border-b-2 px-2 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:min-h-9 ${
              mode === item.id
                ? "border-brand text-brand-ink"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex min-h-9 items-center justify-between gap-2 px-2 py-1">
        <span className="text-[11px] text-ink-muted">
          {eventCount} {eventCount === 1 ? "event" : "events"}
        </span>
        <div ref={menuRef} className="relative">
          <Tooltip content={`Filter ${currentMode.label}`}>
            <button
              type="button"
              aria-label={`Filter ${currentMode.label} activity`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className={`flex h-11 w-11 items-center justify-center gap-1.5 rounded-cozy px-2 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:h-7 sm:w-auto ${
                menuOpen
                  ? "bg-surface-dark text-ink"
                  : "text-ink-secondary hover:bg-surface"
              }`}
            >
              <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{filters.length}</span>
            </button>
          </Tooltip>

          {menuOpen && (
            <div
              role="menu"
              aria-label={`${currentMode.label} activity filters`}
              className="absolute right-0 top-full z-30 mt-1 w-56 rounded-cozy border border-brand/20 bg-paper p-1.5 shadow-lg"
            >
              {options.map((option) => (
                <label
                  key={option.id}
                  className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 text-xs text-ink hover:bg-surface"
                >
                  <input
                    type="checkbox"
                    checked={filters.includes(option.id)}
                    onChange={() => toggle(option.id)}
                    className="h-4 w-4 rounded border-ink-muted/50 accent-[rgb(var(--color-brand))]"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
              <button
                type="button"
                onClick={() => onFiltersChange([...DEFAULT_ACTIVITY_FILTERS[mode]])}
                className="mt-1 flex min-h-9 w-full items-center gap-2 border-t border-brand/10 px-2 pt-1.5 text-left text-xs text-ink-secondary hover:text-ink"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Restore defaults
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
