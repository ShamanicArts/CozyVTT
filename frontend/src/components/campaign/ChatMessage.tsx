// ============================================
// Chat Message Component
// Displays individual chat messages with styling
// ============================================

import { memo } from "react";
import { Bot, Dice5, Shield, Sparkles, User } from "lucide-react";
import type { Message, MessageType } from "@/types";

interface ChatMessageProps {
  message: Message;
  isCurrentUser?: boolean;
  /** True while the message is optimistically displayed before server confirmation */
  isPending?: boolean;
}

/**
 * Format timestamp as relative time (e.g., "2 minutes ago")
 */
function formatRelativeTime(timestamp: string): string {
  // Handle undefined, null, or empty timestamps
  if (!timestamp) {
    return "unknown time";
  }

  const date = new Date(timestamp);

  // Check if date is invalid
  if (isNaN(date.getTime())) {
    console.warn("[ChatMessage] Invalid timestamp:", timestamp);
    return "unknown time";
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60)
    return `${diffMin} ${diffMin === 1 ? "minute" : "minutes"} ago`;
  if (diffHour < 24)
    return `${diffHour} ${diffHour === 1 ? "hour" : "hours"} ago`;
  if (diffDay < 7) return `${diffDay} ${diffDay === 1 ? "day" : "days"} ago`;

  // If older than a week, show the date
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getMessageStyle(type: MessageType) {
  switch (type) {
    case "DM":
      return {
        icon: Shield,
        iconClass: "text-accent-text bg-accent/20",
        nameClass: "text-accent-text",
      };
    case "SYSTEM":
      return {
        icon: Bot,
        iconClass: "text-brand bg-brand/10",
        nameClass: "text-brand",
      };
    case "DICE_ROLL":
      return {
        icon: Dice5,
        iconClass: "text-spirit bg-spirit/10",
        nameClass: "text-spirit",
      };
    case "CHARACTER_ACTION":
      return {
        icon: Sparkles,
        iconClass: "text-spirit bg-spirit/10",
        nameClass: "text-spirit",
      };
    default:
      return {
        icon: User,
        iconClass: "text-brand bg-surface-dark",
        nameClass: "text-ink",
      };
  }
}

const INTERNAL_ACTIONS = new Set([
  "user.joined",
  "user.left",
  "spirit_layer.toggle",
  "vibe.update",
  "session.started",
  "session.paused",
  "session.ended",
  "session.resumed",
]);

function ChatMessageInner({
  message,
  isCurrentUser = false,
  isPending = false,
}: ChatMessageProps) {
  const {
    icon: MessageIcon,
    iconClass,
    nameClass,
  } = getMessageStyle(message.type);
  const isSystem = message.type === "SYSTEM";
  const actorSpeaker =
    typeof message.metadata?.speakerName === "string"
      ? message.metadata.speakerName
      : null;

  // Get display name
  const displayName = isSystem
    ? "System"
    : actorSpeaker || message.user?.displayName || "Unknown User";

  const metadataVisible =
    message.metadata &&
    Object.keys(message.metadata).length > 0 &&
    !INTERNAL_ACTIONS.has(String(message.metadata.action)) &&
    !actorSpeaker;

  return (
    <article
      className={`grid grid-cols-[28px_minmax(0,1fr)] gap-2.5 border-b border-brand/10 px-2 py-2.5 last:border-b-0 ${
        isSystem ? "bg-surface/35" : ""
      } ${isPending ? "opacity-60" : ""}`}
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full ${iconClass}`}
        aria-hidden="true"
      >
        {actorSpeaker ? (
          <Bot className="h-3.5 w-3.5" />
        ) : (
          <MessageIcon className="h-3.5 w-3.5" />
        )}
      </span>

      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={`text-xs font-semibold ${nameClass}`}>
            {displayName}
            {isCurrentUser &&
              !isSystem &&
              (actorSpeaker ? " (via You)" : " (You)")}
          </span>

          {isPending ? (
            <span className="text-[11px] italic text-ink-muted">sending…</span>
          ) : (
            <time
              className="text-[11px] text-ink-muted"
              dateTime={message.createdAt}
              title={
                message.createdAt
                  ? new Date(message.createdAt).toLocaleString()
                  : "Unknown time"
              }
            >
              {formatRelativeTime(message.createdAt)}
            </time>
          )}
        </div>

        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
          {message.content}
        </p>

        {metadataVisible && (
          <details className="mt-1.5 text-xs text-ink-secondary">
            <summary className="w-fit cursor-pointer rounded px-1 py-0.5 hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              Details
            </summary>
            <pre className="mt-1 max-w-full overflow-x-auto rounded-cozy bg-surface p-2 font-mono text-[11px]">
              {JSON.stringify(message.metadata, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </article>
  );
}

// Memoised — chat panels can hold dozens of messages; without memo every new
// message causes the entire list to re-render. With memo only the new message
// and any that changed (e.g. pending → confirmed) re-render.
const ChatMessage = memo(ChatMessageInner);
export default ChatMessage;
