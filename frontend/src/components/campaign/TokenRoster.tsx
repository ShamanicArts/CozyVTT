// ============================================
// TokenRoster
// DM-only compact list of tokens on the current map
// Grouped by type (Player / NPC / Object)
// Actions: Edit (NPC/Object), Duplicate, Remove
// ============================================

import { useState, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import { useCampaign } from "@/contexts/CampaignContext";
import { useWebSocket } from "@/contexts/WebSocketContext";
import { useGameStore, useTokenListIgnoringMovement } from "@/stores/gameStore";
import api from "@/services/api";
import type { Token } from "@/types";
import { TokenType } from "@/types";

// ============================================
// Props
// ============================================

interface TokenRosterProps {
  onEditToken?: (token: Token) => void;
}

// ============================================
// Helpers
// ============================================

function getEffectiveType(token: Token): TokenType {
  if (token.type) return token.type;
  return token.characterId ? TokenType.PLAYER : TokenType.NPC;
}

function hpPresentation(
  token: Token,
): { label: string; colorClass: string } | null {
  if (!token.hp || token.hp.max === 0) return null;
  const pct = token.hp.current / token.hp.max;
  const colorClass =
    pct >= 0.75
      ? "bg-moss-green"
      : pct >= 0.5
        ? "bg-lime-500"
        : pct >= 0.25
          ? "bg-warm-amber"
          : "bg-danger";
  return { label: `${token.hp.current}/${token.hp.max}`, colorClass };
}

// ============================================
// Sub-component: Token Row
// ============================================

interface TokenRowProps {
  token: Token;
  campaignId: string;
  mapId: string;
  onEditToken?: (token: Token) => void;
}

function TokenRow({ token, campaignId, mapId, onEditToken }: TokenRowProps) {
  const { currentMap } = useCampaign();
  const { socket } = useWebSocket();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);

  const tokenType = getEffectiveType(token);
  const canEdit = tokenType === TokenType.NPC || tokenType === TokenType.OBJECT;

  const handleDuplicate = useCallback(async () => {
    if (!currentMap) return;
    setIsDuplicating(true);
    try {
      // The roster subscribes ignoring movement, so this row's `token` prop
      // can hold a stale position — read the live one at action time.
      const livePosition =
        useGameStore.getState().tokens[token.id]?.position ?? token.position;
      const newX = Math.min(
        livePosition.x + 1,
        currentMap.width - token.size.width,
      );
      const newY = Math.min(
        livePosition.y + 1,
        currentMap.height - token.size.height,
      );
      const freshHp = token.hp
        ? { current: token.hp.max, max: token.hp.max, temp: 0 }
        : null;
      const result = await api.addToken(campaignId, mapId, {
        name: token.name,
        imageUrl: token.imageUrl,
        position: { x: newX, y: newY },
        size: token.size,
        layer: token.layer,
        visible: token.visible,
        controlledBy: token.controlledBy,
        type: token.type,
        disposition: token.disposition,
        hp: freshHp,
        showHpBar: token.showHpBar,
        notes: token.notes,
        initiative: token.initiative,
        conditions: [],
      });
      useGameStore.getState().addToken(result.token);
      socket?.emitMapChange(mapId);
    } catch (err) {
      console.error("TokenRoster: failed to duplicate token", err);
    } finally {
      setIsDuplicating(false);
    }
  }, [token, campaignId, mapId, currentMap, socket]);

  const handleToggleVisible = useCallback(async () => {
    try {
      await api.updateToken(campaignId, mapId, token.id, {
        visible: !token.visible,
      });
      useGameStore.getState().patchToken(token.id, { visible: !token.visible });
      socket?.emitMapChange(mapId);
    } catch (err) {
      console.error("TokenRoster: failed to toggle visibility", err);
    }
  }, [token, campaignId, mapId, socket]);

  const handleDelete = useCallback(async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await api.deleteToken(campaignId, mapId, token.id);
      useGameStore.getState().removeToken(token.id);
      socket?.emitMapChange(mapId);
    } catch (err) {
      console.error("TokenRoster: failed to remove token", err);
      setIsDeleting(false);
    }
  }, [token, campaignId, mapId, socket, isDeleting]);

  const hp = hpPresentation(token);

  return (
    <div className="group flex items-center gap-2 rounded-cozy px-2 py-1.5 transition-colors hover:bg-surface">
      {/* Token image */}
      {token.imageUrl ? (
        <img
          src={token.imageUrl}
          alt={token.name}
          className={`h-7 w-7 flex-shrink-0 rounded-full border border-brand/20 object-cover ${
            !token.visible ? "opacity-40" : ""
          }`}
        />
      ) : (
        <div className="h-7 w-7 flex-shrink-0 rounded-full bg-brand/10" />
      )}

      {/* Name + HP */}
      <div className="flex-1 min-w-0">
        <p
          className={`truncate text-xs font-medium ${!token.visible ? "text-ink-muted" : "text-ink"}`}
        >
          {token.name}
          {!token.visible && (
            <span className="ml-1 text-[10px] text-ink-muted">hidden</span>
          )}
        </p>
        {hp && (
          <p className="flex items-center gap-1 text-[10px] tabular-nums text-ink-muted">
            <span
              className={`h-1.5 w-1.5 rounded-full ${hp.colorClass}`}
              aria-hidden="true"
            />
            {hp.label}
          </p>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center gap-0.5">
        {/* Edit (NPC/Object only) */}
        {canEdit && onEditToken && (
          <button
            onClick={() => onEditToken(token)}
            title="Edit token"
            className="rounded p-1 text-brand transition-colors hover:bg-brand/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Edit2 className="w-3 h-3" />
          </button>
        )}

        {/* Toggle visibility */}
        <button
          onClick={handleToggleVisible}
          title={token.visible ? "Hide from players" : "Show to players"}
          className="rounded p-1 text-ink-muted transition-colors hover:bg-brand/10 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {token.visible ? (
            <EyeOff className="w-3 h-3" />
          ) : (
            <Eye className="w-3 h-3" />
          )}
        </button>

        {/* Duplicate */}
        <button
          onClick={handleDuplicate}
          disabled={isDuplicating}
          title="Duplicate token"
          className="rounded p-1 text-ink-muted transition-colors hover:bg-brand/10 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40"
        >
          {isDuplicating ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>

        {/* Remove */}
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          title="Remove from map"
          className="rounded p-1 text-danger/70 transition-colors hover:bg-danger/10 hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40"
        >
          {isDeleting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Trash2 className="w-3 h-3" />
          )}
        </button>
      </div>
    </div>
  );
}

// ============================================
// Sub-component: Type Group
// ============================================

interface TokenGroupProps {
  label: string;
  tokens: Token[];
  campaignId: string;
  mapId: string;
  onEditToken?: (token: Token) => void;
  defaultOpen?: boolean;
}

function TokenGroup({
  label,
  tokens,
  campaignId,
  mapId,
  onEditToken,
  defaultOpen = true,
}: TokenGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  if (tokens.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-ink-muted transition-colors hover:text-ink"
      >
        {isOpen ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        {label} ({tokens.length})
      </button>
      {isOpen && (
        <div>
          {tokens.map((t) => (
            <TokenRow
              key={t.id}
              token={t}
              campaignId={campaignId}
              mapId={mapId}
              onEditToken={onEditToken}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function TokenRoster({ onEditToken }: TokenRosterProps) {
  const { campaign, currentMap } = useCampaign();
  // Movement-ignoring subscription: the roster renders names/flags/HP, not
  // coordinates, so it stays static while tokens are dragged around the map.
  const tokens = useTokenListIgnoringMovement();
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!currentMap || !campaign) return null;

  const players = tokens.filter(
    (t) => getEffectiveType(t) === TokenType.PLAYER,
  );
  const npcs = tokens.filter((t) => getEffectiveType(t) === TokenType.NPC);
  const objects = tokens.filter(
    (t) => getEffectiveType(t) === TokenType.OBJECT,
  );

  if (tokens.length === 0) return null;

  return (
    <section aria-label="Map tokens">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex w-full items-center justify-between px-3 py-2.5 transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-ink">
            Map tokens
          </span>
          <span className="text-[11px] tabular-nums text-ink-muted">
            {tokens.length}
          </span>
        </div>
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4 text-ink-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-ink-muted" />
        )}
      </button>

      {/* Token list */}
      {!isCollapsed && (
        <div className="border-t border-brand/10 py-1">
          <TokenGroup
            label="Players"
            tokens={players}
            campaignId={campaign.id}
            mapId={currentMap.id}
            onEditToken={onEditToken}
            defaultOpen={true}
          />
          <TokenGroup
            label="NPCs"
            tokens={npcs}
            campaignId={campaign.id}
            mapId={currentMap.id}
            onEditToken={onEditToken}
            defaultOpen={true}
          />
          <TokenGroup
            label="Objects"
            tokens={objects}
            campaignId={campaign.id}
            mapId={currentMap.id}
            onEditToken={onEditToken}
            defaultOpen={false}
          />
        </div>
      )}
    </section>
  );
}
