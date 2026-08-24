import { asError } from "@/utils/errors";
// ============================================
// Chat Panel Component
// Real-time chat with message history and WebSocket integration
// ============================================

import { useState, useEffect, useRef, FormEvent, KeyboardEvent } from "react";
import { MessageCircle, Send, Loader, AlertCircle } from "lucide-react";
import { useParams } from "react-router-dom";
import { useWebSocket } from "@/contexts/WebSocketContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCampaign } from "@/contexts/CampaignContext";
import { getMessages } from "@/services/message.service";
import ChatMessage from "./ChatMessage";
import DiceResult from "./DiceResult";
import ChatMessageSkeleton from "@/components/skeletons/ChatMessageSkeleton";
import { MessageType, PlatformRole } from "@/types";
import type { DiceRolledEvent, Message, ChatMessageBroadcast } from "@/types";
import Button from "@/components/ui/Button";
import api from "@/services/api";
import ActivityStreamControls from "./ActivityStreamControls";
import {
  messageMatchesActivityFilters,
  normalizeActivityFilters,
  diceRollActivityMessage,
  diceRollEventFromMessage,
  type ActivityCategory,
  type ActivityMode,
} from "./activityStream";

const ACTIVITY_FILTER_STORAGE_KEY = "cozyvtt.activity-filters.v1";

function initialActivityFilters(userId?: string) {
  try {
    const value = localStorage.getItem(
      `${ACTIVITY_FILTER_STORAGE_KEY}:${userId ?? "anonymous"}`,
    );
    return normalizeActivityFilters(value ? JSON.parse(value) : null);
  } catch {
    return normalizeActivityFilters(null);
  }
}

export default function ChatPanel() {
  const { id: campaignId } = useParams<{ id: string }>();
  const { socket, reconnectCount } = useWebSocket();
  const { user } = useAuth();
  const { userRole, campaign } = useCampaign();

  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [activityMode, setActivityMode] = useState<ActivityMode>("general");
  const [activityFilters, setActivityFilters] = useState(() =>
    initialActivityFilters(user?.id),
  );

  // Rate limiting state (10 messages per minute = 1 per 6 seconds)
  const [canSend, setCanSend] = useState(true);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  const visibleMessages = messages.filter((message) =>
    messageMatchesActivityFilters(message, activityFilters[activityMode]),
  );

  useEffect(() => {
    localStorage.setItem(
      `${ACTIVITY_FILTER_STORAGE_KEY}:${user?.id ?? "anonymous"}`,
      JSON.stringify(activityFilters),
    );
  }, [activityFilters, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    api.getUserPreferences(user.id).then((preferences) => {
      if (!cancelled && preferences.activityFilters) {
        setActivityFilters(normalizeActivityFilters(preferences.activityFilters));
      }
    }).catch(() => {
      // The user-scoped local cache remains available while offline.
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const updateActivityFilters = (filters: ActivityCategory[]) => {
    const updated = { ...activityFilters, [activityMode]: filters };
    setActivityFilters(updated);
    if (user?.id) {
      void api.updateUserPreferences(user.id, {
        activityFilters: updated,
      }).catch(() => {
        // Keep the optimistic local preference and retry on a later change.
      });
    }
  };

  const resetActivityMode = (mode: ActivityMode) => {
    setActivityMode(mode);
    setTimeout(() => scrollToBottom(false), 0);
  };

  // ============================================
  // Scroll Management
  // ============================================

  /**
   * Check if user is scrolled to bottom
   */
  const isAtBottom = (): boolean => {
    const container = messagesContainerRef.current;
    if (!container) return true;

    const threshold = 50; // pixels from bottom
    const isBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      threshold;
    return isBottom;
  };

  /**
   * Scroll to bottom of messages.
   * Uses scrollTo on the container directly to avoid scrollIntoView
   * propagating up to parent scrollable elements (e.g. the sidebar).
   */
  const scrollToBottom = (smooth = true) => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  };

  /**
   * Update wasAtBottom ref when user scrolls
   */
  const handleScroll = () => {
    wasAtBottomRef.current = isAtBottom();
  };

  // ============================================
  // Load Messages
  // ============================================

  /**
   * Load initial messages
   */
  useEffect(() => {
    if (!campaignId) return;

    const loadInitialMessages = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const fetchedMessages = await getMessages(campaignId, 50);

        setMessages(fetchedMessages.reverse()); // API returns newest first, we want oldest first
        setHasMore(fetchedMessages.length === 50);

        // Scroll to bottom after initial load (without smooth)
        setTimeout(() => scrollToBottom(false), 100);
      } catch (_caught) {
      const err = asError(_caught);
        console.error("[ChatPanel] Failed to load messages:", err);
        setError(err.message || "Failed to load messages");
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialMessages();
  }, [campaignId]);

  /**
   * Resync chat history after a WebSocket reconnect.
   *
   * The realtime stream may have missed messages while we were disconnected
   * (chat is fire-and-forget over the socket — backend stores every message
   * in Postgres, but only live subscribers see them in real time). On
   * reconnect, refetch the last 50 messages and merge with what we already
   * have, deduping by id. Any messages the user missed during the drop
   * appear inline at the bottom.
   *
   * Driven by `reconnectCount` from WebSocketContext, which increments only
   * on actual reconnects (never on initial connect). Skips when count is 0.
   */
  useEffect(() => {
    if (!campaignId || reconnectCount === 0) return;

    const resync = async () => {
      try {
        const fetched = await getMessages(campaignId, 50);
        const fresh = fetched.reverse(); // API returns newest first

        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const merged = [...prev];
          for (const msg of fresh) {
            if (!seen.has(msg.id)) {
              merged.push(msg);
            }
          }
          // Re-sort by createdAt to keep order correct if a gap was filled
          merged.sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
          return merged;
        });
      } catch (_caught) {
      const err = asError(_caught);
        console.error(
          "[ChatPanel] Failed to resync messages after reconnect:",
          err,
        );
        // Non-fatal — user will still see new messages going forward
      }
    };

    resync();
  }, [campaignId, reconnectCount]);

  /**
   * Load more messages (pagination)
   */
  const loadMoreMessages = async () => {
    if (!campaignId || isLoadingMore || !hasMore || messages.length === 0)
      return;

    try {
      setIsLoadingMore(true);

      // Get the oldest message timestamp for cursor-based pagination
      const oldestMessage = messages[0];
      const before = oldestMessage.createdAt;

      const fetchedMessages = await getMessages(campaignId, 50, before);

      if (fetchedMessages.length === 0) {
        setHasMore(false);
        return;
      }

      // Add older messages to the beginning
      setMessages((prev) => [...fetchedMessages.reverse(), ...prev]);
      setHasMore(fetchedMessages.length === 50);
    } catch (_caught) {
      const err = asError(_caught);
      console.error("[ChatPanel] Failed to load more messages:", err);
      setError(err.message || "Failed to load more messages");
    } finally {
      setIsLoadingMore(false);
    }
  };

  // ============================================
  // WebSocket Integration
  // ============================================

  /**
   * Listen for incoming chat messages
   */
  useEffect(() => {
    if (!socket) return;

    const handleChatMessage = (data: ChatMessageBroadcast) => {
      console.log("[ChatPanel] Received chat message:", data);

      // Convert broadcast format to Message format
      const newMessage: Message = {
        id: data.id,
        campaignId: campaignId!,
        userId: data.userId,
        user: {
          id: data.userId,
          displayName: data.userName,
          email: "",
          platformRole: PlatformRole.USER,
          globalAssetManager: false,
          mfaEnabled: false,
          avatarUrl: null,
          bio: null,
          createdAt: data.timestamp,
          updatedAt: data.timestamp,
          lastLoginAt: null,
        },
        type: data.type,
        content: data.content,
        metadata: null,
        createdAt: data.timestamp,
      };

      // Deduplicate: Replace optimistic message if this is from current user
      setMessages((prev) => {
        // Check if this is our own message (from optimistic UI)
        if (user && data.userId === user.id) {
          // Find and replace the optimistic message with matching content
          const optimisticIndex = prev.findIndex(
            (msg) =>
              msg.id.startsWith("temp-") &&
              msg.userId === data.userId &&
              msg.content === data.content &&
              msg.type === data.type,
          );

          if (optimisticIndex !== -1) {
            // Replace optimistic message with real one
            const updated = [...prev];
            updated[optimisticIndex] = newMessage;
            console.log(
              "[ChatPanel] Replaced optimistic message with real message",
            );
            return updated;
          }
        }

        // Not a duplicate, add as new message
        return [...prev, newMessage];
      });

      // Auto-scroll if user was at bottom
      if (wasAtBottomRef.current) {
        setTimeout(() => scrollToBottom(true), 50);
      }
    };

    const handleSystemMessage = (data: {
      id?: string;
      content: string;
      metadata?: Message["metadata"];
      timestamp: string;
    }) => {
      console.log("[ChatPanel] Received system message:", data);

      const systemMessage: Message = {
        id: data.id ?? `system-${Date.now()}`,
        campaignId: campaignId!,
        userId: null,
        type: MessageType.SYSTEM,
        content: data.content,
        metadata: data.metadata || null,
        createdAt: data.timestamp,
      };

      setMessages((prev) => [...prev, systemMessage]);

      if (wasAtBottomRef.current) {
        setTimeout(() => scrollToBottom(true), 50);
      }
    };

    const handleDiceRolled = (data: DiceRolledEvent) => {
      // Initiative broadcasts share this socket event but do not create a
      // persisted activity message.
      const rollMessage = diceRollActivityMessage(data, campaignId!);
      if (!rollMessage) return;
      setMessages((previous) =>
        previous.some((message) => message.id === rollMessage.id)
          ? previous
          : [...previous, rollMessage],
      );
      if (wasAtBottomRef.current) {
        setTimeout(() => scrollToBottom(true), 50);
      }
    };

    socket.onChatMessage(handleChatMessage);
    socket.onChatSystem(handleSystemMessage);
    socket.onDiceRolled(handleDiceRolled);

    return () => {
      socket.off("chat.message", handleChatMessage);
      socket.off("chat.system", handleSystemMessage);
      socket.off("dice.rolled", handleDiceRolled);
    };
  }, [socket, campaignId]);

  // ============================================
  // Rate Limiting
  // ============================================

  /**
   * Cooldown timer
   */
  useEffect(() => {
    if (cooldownSeconds > 0) {
      const timer = setTimeout(() => {
        setCooldownSeconds((prev) => prev - 1);
      }, 1000);

      return () => clearTimeout(timer);
    } else if (cooldownSeconds === 0 && !canSend) {
      setCanSend(true);
    }

    return undefined;
  }, [cooldownSeconds, canSend]);

  /**
   * Start rate limit cooldown (only if the DM has enabled it for this campaign)
   */
  const startCooldown = () => {
    if (!campaign?.chatCooldownEnabled) return;
    setCanSend(false);
    setCooldownSeconds(campaign.chatCooldownSeconds ?? 5);
  };

  // ============================================
  // Send Message
  // ============================================

  /**
   * Handle message submission
   */
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage();
  };

  /**
   * Handle Enter key (submit) and Shift+Enter (newline)
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /**
   * Send chat message via WebSocket
   */
  const sendMessage = (): void => {
    if (!messageInput.trim() || !canSend || !socket || !campaignId || !user)
      return;

    const content = messageInput.trim();

    const messageType: MessageType =
      userRole === "DM" ? MessageType.DM : MessageType.PLAYER;

    try {
      console.log("[ChatPanel] Sending message:", content);

      // Emit to WebSocket (campaignId comes from server-side socket.campaignId)
      socket.emitChatMessage({
        content,
        type: messageType,
      });

      // Optimistic UI: Add message immediately
      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        campaignId,
        userId: user.id,
        user: {
          id: user.id,
          displayName: user.displayName,
          email: user.email,
          platformRole: user.platformRole,
          globalAssetManager: user.globalAssetManager,
          mfaEnabled: user.mfaEnabled,
          avatarUrl: user.avatarUrl,
          bio: user.bio,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLoginAt: user.lastLoginAt,
        },
        type: messageType,
        content,
        metadata: null,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      // Clear input and scroll
      setMessageInput("");
      setTimeout(() => scrollToBottom(true), 50);

      // Start rate limit cooldown
      startCooldown();
    } catch (_caught) {
      const err = asError(_caught);
      console.error("[ChatPanel] Failed to send message:", err);
      setError("Failed to send message");
    }
  };

  // ============================================
  // Render
  // ============================================

  if (isLoading) {
    return (
      <div className="flex h-full flex-col bg-canvas">
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          <ChatMessageSkeleton variant="long" />
          <ChatMessageSkeleton variant="short" />
          <ChatMessageSkeleton variant="medium" />
          <ChatMessageSkeleton variant="long" />
          <ChatMessageSkeleton variant="short" />
        </div>
        <div className="animate-pulse border-t border-brand/15 p-2">
          <div className="h-11 rounded-cozy bg-surface" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-canvas">
      <ActivityStreamControls
        mode={activityMode}
        filters={activityFilters[activityMode]}
        eventCount={visibleMessages.length}
        onModeChange={resetActivityMode}
        onFiltersChange={updateActivityFilters}
      />

      {error && (
        <div
          role="alert"
          className="m-2 flex items-center gap-2 rounded-cozy border border-danger/25 bg-danger/5 p-2.5"
        >
          <AlertCircle
            className="h-4 w-4 flex-shrink-0 text-danger"
            aria-hidden="true"
          />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label={`${activityMode === "game" ? "Game log" : activityMode === "system" ? "System" : "General"} activity`}
        aria-relevant="additions"
        className="min-h-0 flex-1 overflow-y-auto px-1"
      >
        {hasMore && messages.length > 0 && (
          <div className="py-2 text-center">
            <Button
              onClick={loadMoreMessages}
              disabled={isLoadingMore}
              variant="ghost"
              size="sm"
            >
              {isLoadingMore ? (
                <>
                  <Loader
                    className="mr-2 h-3 w-3 animate-spin"
                    aria-hidden="true"
                  />
                  Loading
                </>
              ) : (
                "Load More"
              )}
            </Button>
          </div>
        )}

        {visibleMessages.length === 0 ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center px-5 text-center">
            <MessageCircle
              className="mb-2 h-8 w-8 text-brand/35"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-ink-secondary">
              {messages.length === 0
                ? "Start the conversation"
                : "No events match these filters"}
            </p>
          </div>
        ) : (
          <>
            {visibleMessages.map((message) => {
              const roll = diceRollEventFromMessage(message);
              return roll ? (
                <DiceResult
                  key={message.id}
                  roll={roll}
                  isCurrentUser={message.userId === user?.id}
                />
              ) : (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isCurrentUser={message.userId === user?.id}
                  isPending={message.id.startsWith("temp-")}
                />
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="border-t border-brand/15 bg-surface-light p-2">
        <form onSubmit={handleSubmit}>
          <div className="flex items-end gap-2">
            <textarea
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message the party"
              aria-label="Chat message"
              className="input-cozy min-h-11 max-h-[120px] flex-1 resize-none text-sm"
              rows={1}
              disabled={!canSend}
            />
            <Button
              type="submit"
              iconOnly
              className="min-h-11 min-w-11"
              disabled={!messageInput.trim() || !canSend}
              aria-label={
                !canSend
                  ? `Rate limited: wait ${cooldownSeconds} seconds`
                  : "Send message"
              }
            >
              {!canSend && cooldownSeconds > 0 ? (
                <span className="font-mono text-xs" aria-hidden="true">
                  {cooldownSeconds}s
                </span>
              ) : (
                <Send className="w-4 h-4" aria-hidden="true" />
              )}
            </Button>
          </div>

          {!canSend && cooldownSeconds > 0 && (
            <p className="mt-1.5 text-center text-xs text-accent-ink">
              Wait {cooldownSeconds}s before sending another message
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
