/**
 * Campaign Roster Component
 * Displays campaign members and their assigned characters with click handlers
 * Supports real-time updates via WebSocket
 */

import { useState, useEffect } from "react";
import { useCampaign } from "@/contexts/CampaignContext";
import { useWebSocket } from "@/contexts/WebSocketContext";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import {
  Users,
  Crown,
  Gamepad2,
  Eye,
  Edit,
  UserPlus,
  X,
  Minus,
  Plus,
  Dices,
  type LucideIcon,
} from "lucide-react";
import type { CharacterHpInfo } from "@/utils/characterHp";
import CharacterSheetViewerModal from "../character/CharacterSheetViewerModal";
import CharacterSheetEditorModal from "../character/CharacterSheetEditorModal";
import CharacterContextMenu from "./CharacterContextMenu";
import CharacterRollPicker from "./CharacterRollPicker";
import Toast, { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import type { CampaignRole, GameSystem, Character } from "@/types";

interface RosterMember {
  userId: string;
  userName: string;
  userAvatar: string | null;
  role: CampaignRole;
  joinedAt: string;
  characters: {
    id: string;
    name: string;
    tokenImageUrl: string | null;
    gameSystem: GameSystem | null;
    userId: string;
    hp: CharacterHpInfo | null;
  }[];
}

export default function CampaignRoster() {
  const { campaign, userRole, characterHpCache, seedCharacterHpCache } =
    useCampaign();
  const { socket } = useWebSocket();
  const { user } = useAuth();
  const { toast, showToast, hideToast } = useToast();
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(
    null,
  );
  const [editorCharacter, setEditorCharacter] = useState<Character | null>(
    null,
  );
  const [_viewerLoading, setViewerLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    characterId: string;
    characterUserId: string;
  } | null>(null);
  const [rollPicker, setRollPicker] = useState<{
    x: number;
    y: number;
    characterId: string;
  } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Fetch roster data
  const fetchRoster = async () => {
    if (!campaign?.id) return;

    try {
      setLoading(true);
      const response = await api.getCampaignCharacters(campaign.id);
      setRoster(response.roster);

      // Seed the HP cache in CampaignContext so MapCanvas can render player HP bars
      const hpEntries = response.roster.flatMap((m: RosterMember) =>
        m.characters.map((c) => ({ id: c.id, hp: c.hp })),
      );
      seedCharacterHpCache(hpEntries);
    } catch (error) {
      console.error("Error fetching campaign roster:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoster();
  }, [campaign?.id]);

  // Listen for roster updates via WebSocket
  useEffect(() => {
    if (!socket || !campaign?.id) return;

    const handleRosterUpdate = () => {
      console.log("Roster updated - refetching...");
      fetchRoster();
    };

    socket.on("roster.updated", handleRosterUpdate);

    return () => {
      socket.off("roster.updated", handleRosterUpdate);
    };
  }, [socket, campaign?.id]);

  // Handle character click - fetch full character and open viewer
  const handleCharacterClick = async (characterId: string) => {
    try {
      setViewerLoading(true);
      const { character } = await api.getCharacter(characterId);
      setSelectedCharacter(character);
    } catch (error) {
      console.error("Error fetching character:", error);
    } finally {
      setViewerLoading(false);
    }
  };

  // Close character viewer
  const handleCloseViewer = () => {
    setSelectedCharacter(null);
  };

  // Get user's membership in campaign
  const userMembership = campaign?.memberships?.find(
    (m) => m.userId === user?.id,
  );

  // Handle character right-click
  const handleCharacterRightClick = (
    e: React.MouseEvent,
    characterId: string,
    characterUserId: string,
  ) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      characterId,
      characterUserId,
    });
  };

  // Close context menu
  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  // Handle context menu actions
  const handleViewCharacterSheet = async () => {
    if (contextMenu) {
      await handleCharacterClick(contextMenu.characterId);
    }
  };

  const handleEditCharacterSheet = async () => {
    if (contextMenu) {
      try {
        const { character } = await api.getCharacter(contextMenu.characterId);
        setEditorCharacter(character);
      } catch (error) {
        console.error("Error fetching character for editing:", error);
        showToast("Failed to load character for editing", "error");
      }
    }
  };

  // Close editor modal
  const handleCloseEditor = () => {
    setEditorCharacter(null);
  };

  // Handle editor save - refresh roster
  const handleEditorSaved = async () => {
    await fetchRoster();
  };

  // Emit HP delta via WebSocket — optimistic update happens via the broadcast echo
  const handleHpDelta = (characterId: string, delta: number) => {
    socket?.emitCharacterHpUpdate({ characterId, delta });
  };

  const handleReassignCharacter = async () => {
    showToast("Character reassignment is not yet available", "info");
  };

  const handleRemoveFromCampaign = () => {
    if (!contextMenu || !campaign) return;
    setConfirmRemove(true);
  };

  const handleConfirmRemove = async () => {
    if (!contextMenu || !campaign) return;
    setConfirmRemove(false);
    try {
      await api.assignCharacterToCampaign(contextMenu.characterId, null);
      await fetchRoster();
    } catch (error) {
      console.error("Error removing character from campaign:", error);
      showToast("Failed to remove character from campaign", "error");
    }
  };

  // Get role icon
  const getRoleIcon = (role: CampaignRole) => {
    switch (role) {
      case "DM":
        return Crown;
      case "PLAYER":
        return Gamepad2;
      case "SPECTATOR":
        return Eye;
      default:
        return Users;
    }
  };

  // Get game system badge color
  const getSystemBadgeColor = (gameSystem: GameSystem | null) => {
    switch (gameSystem) {
      case "DND_5E":
        return "bg-danger/10 text-danger";
      case "PATHFINDER_2E":
        return "bg-brand/10 text-brand";
      case "SHADOWRUN_6E":
        return "bg-spirit-purple/10 text-spirit-purple";
      case "CALL_OF_CTHULHU_7E":
        return "bg-moss-green/10 text-moss-green";
      default:
        return "bg-surface text-ink-secondary";
    }
  };

  // Get game system short name
  const getSystemShortName = (gameSystem: GameSystem | null) => {
    switch (gameSystem) {
      case "DND_5E":
        return "D&D 5e";
      case "PATHFINDER_2E":
        return "PF2e";
      case "SHADOWRUN_6E":
        return "SR6e";
      case "CALL_OF_CTHULHU_7E":
        return "CoC 7e";
      default:
        return "Flex";
    }
  };

  // Group members by role
  const groupedRoster = {
    DM: roster.filter((m) => m.role === "DM"),
    PLAYER: roster.filter((m) => m.role === "PLAYER"),
    SPECTATOR: roster.filter((m) => m.role === "SPECTATOR"),
  };

  return (
    <>
      <section
        className="border-b border-brand/10 px-3 py-3"
        aria-label="Campaign members"
      >
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
            Members
          </h2>
          {!loading && (
            <span className="text-[11px] tabular-nums text-ink-muted">
              {roster.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-3 text-center">
            <p className="text-xs text-ink-muted">Loading members…</p>
          </div>
        ) : roster.length === 0 ? (
          <div className="py-3 text-center">
            <p className="text-xs text-ink-muted">No members yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* DM Section */}
            {groupedRoster.DM.length > 0 && (
              <div>
                <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
                  Dungeon Master
                </h3>
                <div>
                  {groupedRoster.DM.map((member) => (
                    <MemberCard
                      key={member.userId}
                      member={member}
                      getRoleIcon={getRoleIcon}
                      getSystemBadgeColor={getSystemBadgeColor}
                      getSystemShortName={getSystemShortName}
                      onCharacterClick={handleCharacterClick}
                      onCharacterRightClick={handleCharacterRightClick}
                      isDM={userRole === "DM"}
                      currentUserId={user?.id ?? ""}
                      characterHpCache={characterHpCache}
                      onHpDelta={handleHpDelta}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Players Section */}
            {groupedRoster.PLAYER.length > 0 && (
              <div>
                <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
                  Players
                </h3>
                <div>
                  {groupedRoster.PLAYER.map((member) => (
                    <MemberCard
                      key={member.userId}
                      member={member}
                      getRoleIcon={getRoleIcon}
                      getSystemBadgeColor={getSystemBadgeColor}
                      getSystemShortName={getSystemShortName}
                      onCharacterClick={handleCharacterClick}
                      onCharacterRightClick={handleCharacterRightClick}
                      isDM={userRole === "DM"}
                      currentUserId={user?.id ?? ""}
                      characterHpCache={characterHpCache}
                      onHpDelta={handleHpDelta}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Spectators Section */}
            {groupedRoster.SPECTATOR.length > 0 && (
              <div>
                <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
                  Spectators
                </h3>
                <div>
                  {groupedRoster.SPECTATOR.map((member) => (
                    <MemberCard
                      key={member.userId}
                      member={member}
                      getRoleIcon={getRoleIcon}
                      getSystemBadgeColor={getSystemBadgeColor}
                      getSystemShortName={getSystemShortName}
                      onCharacterClick={handleCharacterClick}
                      onCharacterRightClick={handleCharacterRightClick}
                      isDM={userRole === "DM"}
                      currentUserId={user?.id ?? ""}
                      characterHpCache={characterHpCache}
                      onHpDelta={handleHpDelta}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Character Viewer Modal */}
      {selectedCharacter && userMembership && campaign && (
        <CharacterSheetViewerModal
          character={selectedCharacter}
          campaignId={campaign.id}
          membership={userMembership}
          onClose={handleCloseViewer}
        />
      )}

      {/* Character Context Menu */}
      {contextMenu && user && userMembership && (
        <CharacterContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              icon: Eye,
              label: "View Character Sheet",
              onClick: handleViewCharacterSheet,
              visible: true,
            },
            {
              icon: Dices,
              label: "Roll...",
              onClick: () => {
                setRollPicker({
                  x: contextMenu.x,
                  y: contextMenu.y,
                  characterId: contextMenu.characterId,
                });
                handleCloseContextMenu();
              },
              visible: true,
            },
            {
              icon: Edit,
              label: "Edit Character Sheet",
              onClick: handleEditCharacterSheet,
              visible:
                user.id === contextMenu.characterUserId ||
                userMembership.role === "DM",
            },
            {
              icon: UserPlus,
              label: "Reassign to Player",
              onClick: handleReassignCharacter,
              visible: userMembership.role === "DM",
            },
            {
              icon: X,
              label: "Remove from Campaign",
              onClick: handleRemoveFromCampaign,
              visible:
                user.id === contextMenu.characterUserId ||
                userMembership.role === "DM",
              className: "text-red-600 hover:bg-red-50",
            },
          ]}
          onClose={handleCloseContextMenu}
        />
      )}

      {/* Roll Picker */}
      {rollPicker && (
        <CharacterRollPicker
          characterId={rollPicker.characterId}
          anchorX={rollPicker.x}
          anchorY={rollPicker.y}
          onRoll={(expression, purpose) => {
            socket?.emitDiceRoll({ expression, purpose });
          }}
          onClose={() => setRollPicker(null)}
        />
      )}

      {/* Character Editor Modal */}
      {editorCharacter && (
        <CharacterSheetEditorModal
          character={editorCharacter}
          onClose={handleCloseEditor}
          onSaved={handleEditorSaved}
        />
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        show={toast.show}
        onClose={hideToast}
      />

      <ConfirmDialog
        isOpen={confirmRemove}
        title="Remove from Campaign"
        message="Are you sure you want to remove this character from the campaign?"
        confirmLabel="Remove"
        variant="danger"
        onConfirm={handleConfirmRemove}
        onCancel={() => setConfirmRemove(false)}
      />
    </>
  );
}

interface MemberCardProps {
  member: RosterMember;
  getRoleIcon: (role: CampaignRole) => LucideIcon;
  getSystemBadgeColor: (gameSystem: GameSystem | null) => string;
  getSystemShortName: (gameSystem: GameSystem | null) => string;
  onCharacterClick: (characterId: string) => void;
  onCharacterRightClick: (
    e: React.MouseEvent,
    characterId: string,
    characterUserId: string,
  ) => void;
  isDM: boolean;
  currentUserId: string;
  characterHpCache: Record<string, CharacterHpInfo>;
  onHpDelta: (characterId: string, delta: number) => void;
}

function MemberCard({
  member,
  getRoleIcon,
  getSystemBadgeColor,
  getSystemShortName,
  onCharacterClick,
  onCharacterRightClick,
  isDM,
  currentUserId,
  characterHpCache,
  onHpDelta,
}: MemberCardProps) {
  const RoleIcon = getRoleIcon(member.role);

  return (
    <div className="border-b border-brand/10 py-2 last:border-b-0">
      {/* Member Info */}
      <div className="mb-1.5 flex items-center gap-2">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-full ${
            member.role === "DM" ? "bg-brand/10" : "bg-spirit-purple/10"
          }`}
        >
          <RoleIcon
            className={`h-3.5 w-3.5 ${
              member.role === "DM" ? "text-brand" : "text-spirit-purple"
            }`}
            aria-hidden="true"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-xs font-medium text-ink">
            {member.userName}
          </p>
          {member.characters.length > 0 && (
            <p className="text-[11px] text-ink-muted">
              {member.characters.length}{" "}
              {member.characters.length === 1 ? "character" : "characters"}
            </p>
          )}
        </div>
      </div>

      {/* Characters */}
      {member.characters.length > 0 && (
        <div className="ml-9">
          {member.characters.map((character) => {
            const canDrag = isDM && !!character.tokenImageUrl;
            return (
              <div
                key={character.id}
                className="border-t border-brand/10 py-1.5 first:border-t-0"
              >
                <div
                  onClick={() => onCharacterClick(character.id)}
                  onContextMenu={(e) =>
                    onCharacterRightClick(e, character.id, character.userId)
                  }
                  className="flex cursor-pointer items-center gap-2 rounded-cozy px-1 py-1 transition-colors hover:bg-surface"
                >
                  {/* Character Token — draggable by DM onto map */}
                  {character.tokenImageUrl ? (
                    <img
                      src={character.tokenImageUrl}
                      alt={character.name}
                      draggable={canDrag}
                      onDragStart={
                        canDrag
                          ? (e) => {
                              e.stopPropagation();
                              e.dataTransfer.effectAllowed = "copy";
                              e.dataTransfer.setData(
                                "text/plain",
                                JSON.stringify({
                                  type: "character-token",
                                  characterId: character.id,
                                  name: character.name,
                                  imageUrl: character.tokenImageUrl,
                                  userId: character.userId,
                                }),
                              );
                            }
                          : undefined
                      }
                      className={`h-6 w-6 rounded-full border border-brand/20 object-cover ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
                      title={
                        canDrag
                          ? `Drag ${character.name} onto the map`
                          : character.name
                      }
                    />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full border border-brand/20 bg-brand/5">
                      <span className="text-xs font-semibold text-brand">
                        {character.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}

                  {/* Character Name */}
                  <p className="flex-1 truncate text-xs font-medium text-ink">
                    {character.name}
                  </p>

                  {/* Game System Badge */}
                  {character.gameSystem && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-medium ${getSystemBadgeColor(
                        character.gameSystem,
                      )}`}
                    >
                      {getSystemShortName(character.gameSystem)}
                    </span>
                  )}
                </div>

                {/* HP bar + controls — shown when character has HP data and user can edit */}
                {(() => {
                  const hp = characterHpCache[character.id] ?? character.hp;
                  const canAdjust = isDM || character.userId === currentUserId;
                  if (!hp || hp.max === 0) return null;
                  const pct = Math.max(0, Math.min(1, hp.current / hp.max));
                  const barColor =
                    pct >= 0.75
                      ? "bg-green-500"
                      : pct >= 0.5
                        ? "bg-lime-500"
                        : pct >= 0.25
                          ? "bg-amber-500"
                          : "bg-red-500";
                  return (
                    <div
                      className="mt-1 space-y-1 px-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* HP progress bar */}
                      <div className="h-1 w-full overflow-hidden rounded-full bg-ink/10">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                          style={{ width: `${pct * 100}%` }}
                        />
                        {hp.temp > 0 && (
                          <div
                            className="-mt-1 ml-auto h-full rounded-full bg-brand/50"
                            style={{
                              width: `${Math.min(1, hp.temp / hp.max) * 100}%`,
                            }}
                          />
                        )}
                      </div>
                      {/* HP controls row */}
                      {canAdjust && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onHpDelta(character.id, -5)}
                            className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-ink-secondary transition-colors hover:bg-danger/10 hover:text-danger"
                            title="−5 HP"
                          >
                            −5
                          </button>
                          <button
                            onClick={() => onHpDelta(character.id, -1)}
                            className="flex h-6 w-6 items-center justify-center rounded text-ink-secondary transition-colors hover:bg-danger/10 hover:text-danger"
                            title="−1 HP"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="flex-1 text-center text-xs font-semibold tabular-nums text-ink">
                            {hp.current}
                            <span className="font-normal text-ink-muted">
                              /{hp.max}
                            </span>
                            {hp.temp > 0 && (
                              <span className="ml-0.5 text-brand">
                                +{hp.temp}
                              </span>
                            )}
                          </span>
                          <button
                            onClick={() => onHpDelta(character.id, 1)}
                            className="flex h-6 w-6 items-center justify-center rounded text-ink-secondary transition-colors hover:bg-moss-green/10 hover:text-moss-green"
                            title="+1 HP"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => onHpDelta(character.id, 5)}
                            className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-ink-secondary transition-colors hover:bg-moss-green/10 hover:text-moss-green"
                            title="+5 HP"
                          >
                            +5
                          </button>
                        </div>
                      )}
                      {/* Read-only HP display for spectators/others who can't adjust */}
                      {!canAdjust && (
                        <p className="text-center text-xs font-semibold tabular-nums text-ink">
                          {hp.current}
                          <span className="font-normal text-ink-muted">
                            /{hp.max}
                          </span>
                          {hp.temp > 0 && (
                            <span className="ml-0.5 text-brand">
                              +{hp.temp}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
