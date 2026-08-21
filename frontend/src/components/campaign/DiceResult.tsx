import {
  AlertTriangle,
  ChevronDown,
  Dices,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import type { DiceRolledEvent } from "@/types";

interface DiceResultProps {
  roll: DiceRolledEvent;
  isCurrentUser: boolean;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const elapsedSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (elapsedSeconds < 10) return "just now";
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function DiceResult({ roll, isCurrentUser }: DiceResultProps) {
  const {
    userName,
    characterName,
    expression,
    result,
    breakdown,
    purpose,
    timestamp,
    secret,
  } = roll;
  const isCriticalSuccess = breakdown.rolls.some(
    (entry) => entry.notation === "1d20" && entry.results?.includes(20),
  );
  const isCriticalFail = breakdown.rolls.some(
    (entry) => entry.notation === "1d20" && entry.results?.includes(1),
  );
  const consequential = isCriticalSuccess || isCriticalFail;

  const resultClass = isCriticalSuccess
    ? "text-green-700"
    : isCriticalFail
      ? "text-danger"
      : "text-ink";

  return (
    <article
      className={`border-b border-brand/10 px-2 py-2.5 last:border-b-0 ${
        consequential ? "bg-surface/40" : ""
      }`}
    >
      <details open={consequential} className="group">
        <summary className="grid cursor-pointer list-none grid-cols-[28px_minmax(0,1fr)_auto] gap-2.5 rounded-cozy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-details-marker]:hidden">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full ${
              isCriticalSuccess
                ? "bg-green-500/15 text-green-700"
                : isCriticalFail
                  ? "bg-danger/10 text-danger"
                  : "bg-brand/10 text-brand"
            }`}
            aria-hidden="true"
          >
            {isCriticalSuccess ? (
              <Sparkles className="h-3.5 w-3.5" />
            ) : isCriticalFail ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : (
              <Dices className="h-3.5 w-3.5" />
            )}
          </span>

          <span className="min-w-0">
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs">
              <strong className="truncate font-semibold text-ink">
                {characterName || userName}
              </strong>
              {characterName && (
                <span className="truncate text-ink-muted">via {userName}</span>
              )}
              {isCurrentUser && <span className="text-ink-muted">(You)</span>}
              <time className="text-[11px] text-ink-muted" dateTime={timestamp}>
                {formatTimestamp(timestamp)}
              </time>
            </span>
            <span className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-xs text-ink-secondary">
                {expression}
              </span>
              <strong
                className={`text-xl font-bold leading-none ${resultClass}`}
              >
                {result}
              </strong>
              {purpose && (
                <span className="truncate text-xs text-ink-secondary">
                  {purpose}
                </span>
              )}
              {secret && !isCurrentUser && (
                <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
                  <LockKeyhole className="h-3 w-3" aria-hidden="true" />
                  Secret
                </span>
              )}
            </span>
          </span>

          <ChevronDown
            className="mt-1 h-4 w-4 text-ink-muted transition-transform duration-150 group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>

        <div className="ml-[38px] mt-2 rounded-cozy bg-surface p-2.5 text-xs text-ink-secondary">
          <div className="font-mono">
            <span className="text-ink-muted">Formula </span>
            {breakdown.formula}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {breakdown.rolls.map((entry, index) => (
              <span key={index} className="contents">
                {entry.type === "dice" && entry.notation && (
                  <span className="inline-flex items-center gap-1 rounded bg-surface-dark px-2 py-1 font-mono">
                    <span className="text-ink-muted">{entry.notation}</span>
                    {entry.results?.map((value, resultIndex) => {
                      const kept = entry.kept
                        ? entry.kept.includes(value)
                        : true;
                      return (
                        <span
                          key={resultIndex}
                          className={`${kept ? "text-ink" : "text-ink-muted line-through"} ${
                            value === 20 && entry.sides === 20
                              ? "font-bold text-green-700"
                              : ""
                          } ${
                            value === 1 && entry.sides === 20
                              ? "font-bold text-danger"
                              : ""
                          }`}
                        >
                          {value}
                        </span>
                      );
                    })}
                    {entry.total !== undefined && (
                      <span className="text-ink-muted">= {entry.total}</span>
                    )}
                  </span>
                )}
                {entry.type === "modifier" && entry.value !== undefined && (
                  <span className="rounded bg-accent/15 px-2 py-1 font-mono text-accent-text">
                    {entry.value >= 0 ? "+" : ""}
                    {entry.value}
                  </span>
                )}
              </span>
            ))}
          </div>
          {consequential && (
            <p className={`mt-2 font-semibold ${resultClass}`}>
              {isCriticalSuccess ? "Critical success" : "Critical failure"}
            </p>
          )}
        </div>
      </details>
    </article>
  );
}
