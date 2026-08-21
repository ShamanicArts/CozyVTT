import { memo, useState } from "react";
import {
  CalendarDays,
  Copy,
  Edit,
  FileDown,
  Link2,
  MoreHorizontal,
  Trash2,
  User,
} from "lucide-react";
import type { Campaign, Character } from "@/types";
import GameSystemBadge from "@/components/common/GameSystemBadge";

interface CharacterCardProps {
  character: Character;
  campaign?: Campaign | null;
  onEdit: (character: Character) => void;
  onCopy: (character: Character) => void;
  onDelete: (character: Character) => void;
  onAssign: (character: Character) => void;
  onExport: (character: Character) => void;
}

function relativeDate(dateString: string): string {
  const elapsedDays = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (elapsedDays <= 0) return "Today";
  if (elapsedDays === 1) return "Yesterday";
  if (elapsedDays < 7) return `${elapsedDays} days ago`;
  if (elapsedDays < 30) return `${Math.floor(elapsedDays / 7)} weeks ago`;
  if (elapsedDays < 365) return `${Math.floor(elapsedDays / 30)} months ago`;
  return `${Math.floor(elapsedDays / 365)} years ago`;
}

function CharacterCardInner({
  character,
  campaign,
  onEdit,
  onCopy,
  onDelete,
  onAssign,
  onExport,
}: CharacterCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  const runAction = (event: React.MouseEvent, action: () => void) => {
    event.stopPropagation();
    setShowMenu(false);
    action();
  };

  return (
    <article
      className={`group relative rounded-cozy border border-brand/15 bg-surface-light transition-colors hover:border-brand/30 ${
        showMenu ? "z-20" : "z-0"
      }`}
    >
      {showMenu && (
        <button
          type="button"
          className="fixed inset-0 z-10 cursor-default"
          aria-label="Close character actions"
          onClick={() => setShowMenu(false)}
        />
      )}

      <button
        type="button"
        onClick={() => onEdit(character)}
        className="flex w-full items-start gap-3 p-4 pr-12 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
      >
        <span className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-cozy border border-brand/20 bg-brand/5">
          {character.tokenImageUrl ? (
            <img
              src={character.tokenImageUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <User className="h-5 w-5 text-brand" aria-hidden="true" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-start justify-between gap-2">
            <span className="min-w-0">
              <strong className="block truncate text-base font-semibold text-ink">
                {character.name}
              </strong>
              <span className="mt-1 block">
                <GameSystemBadge gameSystem={character.gameSystem} size="sm" />
              </span>
            </span>
          </span>

          <span className="mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-brand/10 pt-2 text-xs text-ink-muted">
            <span className="flex min-w-0 items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
              <span className="truncate">{campaign?.name ?? "Unassigned"}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {relativeDate(character.updatedAt)}
            </span>
          </span>
        </span>
      </button>

      <div className="absolute right-2 top-2 z-30">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setShowMenu((open) => !open);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-cozy text-ink-muted transition-colors hover:bg-surface hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label={`Actions for ${character.name}`}
          aria-expanded={showMenu}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>

        {showMenu && (
          <div className="absolute right-0 mt-1 w-48 overflow-hidden rounded-cozy border border-brand/15 bg-surface-light py-1 shadow-lg">
            <MenuAction
              icon={Edit}
              label="Edit"
              onClick={(event) => runAction(event, () => onEdit(character))}
            />
            <MenuAction
              icon={Copy}
              label="Duplicate"
              onClick={(event) => runAction(event, () => onCopy(character))}
            />
            <MenuAction
              icon={Link2}
              label={campaign ? "Reassign campaign" : "Assign to campaign"}
              onClick={(event) => runAction(event, () => onAssign(character))}
            />
            <MenuAction
              icon={FileDown}
              label="Export JSON"
              onClick={(event) => runAction(event, () => onExport(character))}
            />
            <div className="my-1 border-t border-brand/10" />
            <MenuAction
              icon={Trash2}
              label="Delete"
              danger
              onClick={(event) => runAction(event, () => onDelete(character))}
            />
          </div>
        )}
      </div>
    </article>
  );
}

function MenuAction({
  icon: Icon,
  label,
  danger = false,
  onClick,
}: {
  icon: typeof Edit;
  label: string;
  danger?: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
        danger
          ? "text-danger hover:bg-danger/10"
          : "text-ink-secondary hover:bg-surface hover:text-ink"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}

const CharacterCard = memo(CharacterCardInner);
export default CharacterCard;
