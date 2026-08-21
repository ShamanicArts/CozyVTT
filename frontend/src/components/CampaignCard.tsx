// ============================================
// Campaign Card Component
// Displays a campaign as a compact authored object.
// ============================================

import { useNavigate } from "react-router-dom";
import type { Campaign, CampaignRole, CampaignStatus } from "@/types";
import { Users, Crown, Eye, Gamepad2, ArrowRight } from "lucide-react";
import GameSystemBadge from "./common/GameSystemBadge";

interface CampaignCardProps {
  campaign: Campaign;
  userRole: CampaignRole;
}

export default function CampaignCard({
  campaign,
  userRole,
}: CampaignCardProps) {
  const navigate = useNavigate();

  // Get status badge styling
  const getStatusBadge = (status: CampaignStatus) => {
    const badges = {
      PREPARATION: {
        label: "Preparation",
        class: "bg-warm-amber/20 text-warm-amber border-warm-amber/30",
      },
      ACTIVE: {
        label: "Active",
        class: "bg-moss-green/20 text-moss-green border-moss-green/30",
      },
      PAUSED: {
        label: "Paused",
        class: "bg-stone-gray/20 text-stone-gray border-stone-gray/30",
      },
      COMPLETED: {
        label: "Completed",
        class: "bg-spirit-purple/20 text-spirit-purple border-spirit-purple/30",
      },
      ARCHIVED: {
        label: "Archived",
        class: "bg-warm-gray/20 text-warm-gray border-warm-gray/30",
      },
      INACTIVE: {
        label: "Inactive",
        class: "bg-warm-gray/20 text-warm-gray border-warm-gray/30",
      },
    };

    return badges[status] || badges.PREPARATION;
  };

  // Get role badge styling
  const getRoleBadge = (role: CampaignRole) => {
    const badges = {
      DM: {
        label: "DM",
        icon: Crown,
        class: "bg-moss-green/20 text-moss-green border-moss-green/40",
      },
      PLAYER: {
        label: "Player",
        icon: Gamepad2,
        class: "bg-spirit-purple/20 text-spirit-purple border-spirit-purple/40",
      },
      SPECTATOR: {
        label: "Spectator",
        icon: Eye,
        class: "bg-warm-amber/20 text-warm-amber border-warm-amber/40",
      },
    };

    return badges[role] || badges.PLAYER;
  };

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  const statusBadge = getStatusBadge(campaign.status);
  const roleBadge = getRoleBadge(userRole);
  const RoleIcon = roleBadge.icon;

  // Get member count
  const memberCount = campaign.memberships?.length || 0;

  // Get owner display name
  const ownerName =
    campaign.memberships?.find((m) => m.userId === campaign.ownerId)?.user
      ?.displayName || "Unknown";

  return (
    <button
      onClick={() => navigate(`/campaigns/${campaign.id}`)}
      className="group flex min-h-[190px] flex-col rounded-cozy border border-brand/15 bg-surface-light p-4 text-left transition-colors duration-150 hover:border-brand/40 hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-body text-base font-semibold text-ink transition-colors group-hover:text-brand">
            {campaign.name}
          </h3>
          <p className="mt-1 text-xs text-ink-muted">
            Last played {formatDate(campaign.lastPlayedAt)}
          </p>
        </div>
        <span
          className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${roleBadge.class}`}
        >
          <RoleIcon className="h-3 w-3" aria-hidden="true" />
          {roleBadge.label}
        </span>
      </div>

      {campaign.description && (
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-secondary">
          {campaign.description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold ${statusBadge.class}`}
        >
          {statusBadge.label}
        </span>
        <GameSystemBadge gameSystem={campaign.gameSystem} size="md" />
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-brand/10 pt-3 text-xs text-ink-muted">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <Crown className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
            <span className="truncate">{ownerName}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {memberCount}
          </span>
        </div>
        <ArrowRight
          className="h-4 w-4 flex-shrink-0 text-brand transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </div>
    </button>
  );
}
