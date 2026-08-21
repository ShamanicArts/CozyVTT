import { useState } from "react";
import { CalendarDays, Crown, UserPlus, Users } from "lucide-react";
import { useCampaign } from "@/contexts/CampaignContext";
import type { CampaignStatus } from "@/types";
import GameSystemBadge from "../common/GameSystemBadge";
import InvitePlayerModal from "./InvitePlayerModal";

const STATUS_STYLES: Record<
  CampaignStatus,
  { label: string; className: string }
> = {
  PREPARATION: {
    label: "Preparation",
    className: "border-warm-amber/25 bg-warm-amber/10 text-warm-amber",
  },
  ACTIVE: {
    label: "Active",
    className: "border-moss-green/25 bg-moss-green/10 text-moss-green",
  },
  PAUSED: {
    label: "Paused",
    className: "border-ink-muted/20 bg-surface text-ink-secondary",
  },
  COMPLETED: {
    label: "Completed",
    className: "border-spirit-purple/25 bg-spirit-purple/10 text-spirit-purple",
  },
  ARCHIVED: {
    label: "Archived",
    className: "border-ink-muted/20 bg-surface text-ink-muted",
  },
  INACTIVE: {
    label: "Inactive",
    className: "border-ink-muted/20 bg-surface text-ink-muted",
  },
};

export default function CampaignInfo() {
  const { campaign, userRole } = useCampaign();
  const [showInviteModal, setShowInviteModal] = useState(false);

  if (!campaign) {
    return (
      <div className="animate-pulse border-b border-brand/10 p-3">
        <div className="h-4 w-28 rounded bg-ink-muted/15" />
        <div className="mt-3 h-3 w-full rounded bg-ink-muted/10" />
      </div>
    );
  }

  const status = STATUS_STYLES[campaign.status] ?? STATUS_STYLES.PREPARATION;
  const memberCount = campaign.memberships?.length ?? 0;
  const ownerName =
    campaign.memberships?.find(
      (membership) => membership.userId === campaign.ownerId,
    )?.user?.displayName ?? "Unknown";

  return (
    <section
      className="border-b border-brand/10 px-3 py-3"
      aria-label="Campaign overview"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${status.className}`}
        >
          {status.label}
        </span>
        <GameSystemBadge gameSystem={campaign.gameSystem} size="sm" />
        {userRole && (
          <span className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {userRole}
          </span>
        )}
      </div>

      {campaign.description && (
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-ink-secondary">
          {campaign.description}
        </p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div className="flex min-w-0 items-center gap-1.5">
          <Crown
            className="h-3.5 w-3.5 flex-none text-brand"
            aria-hidden="true"
          />
          <dt className="sr-only">Dungeon master</dt>
          <dd className="truncate text-ink-secondary">{ownerName}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <Users
            className="h-3.5 w-3.5 flex-none text-ink-muted"
            aria-hidden="true"
          />
          <dt className="sr-only">Members</dt>
          <dd className="text-ink-secondary">
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </dd>
        </div>
        {campaign.lastPlayedAt && (
          <div className="col-span-2 flex items-center gap-1.5">
            <CalendarDays
              className="h-3.5 w-3.5 flex-none text-ink-muted"
              aria-hidden="true"
            />
            <dt className="sr-only">Last played</dt>
            <dd className="text-ink-muted">
              Last played {new Date(campaign.lastPlayedAt).toLocaleDateString()}
            </dd>
          </div>
        )}
      </dl>

      {userRole === "DM" && (
        <button
          type="button"
          onClick={() => setShowInviteModal(true)}
          className="mt-3 inline-flex h-8 w-full items-center justify-center gap-2 rounded-cozy border border-brand/20 bg-brand/5 px-3 text-xs font-medium text-brand transition-colors hover:bg-brand/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
          Invite player
        </button>
      )}

      {showInviteModal && (
        <InvitePlayerModal
          campaignId={campaign.id}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            setShowInviteModal(false);
            window.location.reload();
          }}
        />
      )}
    </section>
  );
}
