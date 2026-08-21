import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  FolderOpen,
  LogOut,
  Mail,
  Plus,
  RefreshCw,
  Shield,
  Upload,
  User,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
  queryKeys,
  useCampaignsQuery,
  useCharactersQuery,
  usePendingInvitationsQuery,
} from "@/hooks/queries";
import CampaignCard from "@/components/CampaignCard";
import CreateCampaignModal from "@/components/CreateCampaignModal";
import CampaignImportDialog from "@/components/campaign/CampaignImportDialog";
import InvitationModal from "@/components/campaign/InvitationModal";
import CampaignCardSkeleton from "@/components/skeletons/CampaignCardSkeleton";
import Button from "@/components/ui/Button";
import type { Campaign, CampaignInvitation } from "@/types";
import { CampaignRole, PlatformRole } from "@/types";

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { mascotUrl } = useTheme();
  const queryClient = useQueryClient();

  const [selectedInvitation, setSelectedInvitation] =
    useState<CampaignInvitation | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const campaignsQuery = useCampaignsQuery();
  const charactersQuery = useCharactersQuery();
  const invitationsQuery = usePendingInvitationsQuery();

  const campaigns = campaignsQuery.data ?? [];
  const characters = charactersQuery.data ?? [];
  const invitations = invitationsQuery.data ?? [];
  const loading =
    campaignsQuery.isPending ||
    charactersQuery.isPending ||
    invitationsQuery.isPending;
  const queryError =
    campaignsQuery.error || charactersQuery.error || invitationsQuery.error;
  const error = queryError
    ? ((queryError as { response?: { data?: { message?: string } } }).response
        ?.data?.message ?? "Failed to load your dashboard")
    : "";

  const loadData = () => {
    campaignsQuery.refetch();
    charactersQuery.refetch();
    invitationsQuery.refetch();
  };

  const handleCampaignCreated = (newCampaign: Campaign) => {
    queryClient.setQueryData<Campaign[]>(queryKeys.campaigns, (previous) => [
      newCampaign,
      ...(previous ?? []),
    ]);
    showToast(`Campaign "${newCampaign.name}" created!`, "success");
  };

  const getUserRole = (campaign: Campaign): CampaignRole =>
    campaign.memberships?.find((membership) => membership.userId === user?.id)
      ?.role ?? CampaignRole.PLAYER;

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-brand/15 bg-surface-light">
        <div className="mx-auto flex min-h-14 max-w-7xl items-center justify-between gap-3 px-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src={mascotUrl}
              alt=""
              className="h-8 w-8 flex-shrink-0 object-contain"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h1 className="font-body text-sm font-semibold text-ink sm:text-base">
                CozyVTT
              </h1>
              <p className="hidden truncate text-xs text-ink-muted sm:block">
                {user?.displayName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              onClick={loadData}
              disabled={loading}
              variant="ghost"
              iconOnly
              icon={RefreshCw}
              aria-label={
                loading ? "Refreshing dashboard" : "Refresh dashboard"
              }
              title="Refresh"
              className={loading ? "[&_svg]:animate-spin" : undefined}
            />
            {user?.platformRole === PlatformRole.ADMIN && (
              <Button
                onClick={() => navigate("/admin")}
                variant="ghost"
                iconOnly
                icon={Shield}
                aria-label="Open administration"
                title="Administration"
              />
            )}
            <Button
              onClick={() => logout()}
              variant="ghost"
              iconOnly
              icon={LogOut}
              aria-label="Log out"
              title="Log out"
            />
            <button
              onClick={() => navigate("/profile")}
              aria-label={`Open profile for ${user?.displayName ?? "your account"}`}
              className="ml-1 flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-brand/25 bg-surface transition-colors hover:border-brand/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-4 w-4 text-brand" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-7 lg:px-8"
      >
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-body text-xl font-semibold tracking-tight text-ink sm:text-2xl">
              Campaigns
            </h2>
            {!loading && campaigns.length > 0 && (
              <p className="mt-1 text-sm text-ink-muted">
                {campaigns.length} {campaigns.length === 1 ? "table" : "tables"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowImportDialog(true)}
              variant="secondary"
              icon={Upload}
              aria-label="Import campaign"
            >
              <span className="hidden sm:inline">Import</span>
            </Button>
            <Button onClick={() => setShowCreateModal(true)} icon={Plus}>
              New campaign
            </Button>
          </div>
        </div>

        {error && !loading && (
          <div
            role="alert"
            className="mb-5 flex items-center gap-3 rounded-cozy border border-danger/25 bg-danger/5 p-3"
          >
            <AlertCircle
              className="h-4 w-4 flex-shrink-0 text-danger"
              aria-hidden="true"
            />
            <p className="min-w-0 flex-1 text-sm text-danger">{error}</p>
            <Button onClick={loadData} variant="secondary" size="sm">
              Try again
            </Button>
          </div>
        )}

        {!loading && invitations.length > 0 && (
          <section
            aria-labelledby="invitations-heading"
            className="mb-6 rounded-cozy border border-brand/20 bg-surface p-3 sm:p-4"
          >
            <div className="mb-2 flex items-center gap-2">
              <Mail className="h-4 w-4 text-brand" aria-hidden="true" />
              <h3
                id="invitations-heading"
                className="font-body text-sm font-semibold text-ink"
              >
                Invitations
              </h3>
              <span className="rounded-full bg-surface-dark px-2 py-0.5 text-xs font-semibold text-ink-secondary">
                {invitations.length}
              </span>
            </div>
            <div className="divide-y divide-brand/10">
              {invitations.map((invitation) => (
                <button
                  key={invitation.id}
                  type="button"
                  onClick={() => setSelectedInvitation(invitation)}
                  className="group flex w-full items-center justify-between gap-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {invitation.campaign?.name}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">
                      Invited by {invitation.campaign?.owner?.displayName}
                    </span>
                  </span>
                  <ArrowRight
                    className="h-4 w-4 flex-shrink-0 text-brand transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
          <section aria-label="Your campaigns" className="min-w-0">
            {loading && (
              <div className="grid gap-4 md:grid-cols-2">
                {[0, 1, 2, 3].map((index) => (
                  <CampaignCardSkeleton key={index} />
                ))}
              </div>
            )}

            {!loading && campaigns.length === 0 && (
              <div className="rounded-cozy border border-brand/15 bg-surface-light px-5 py-12 text-center">
                <img
                  src={mascotUrl}
                  alt=""
                  className="mx-auto mb-3 h-10 w-10 object-contain"
                  aria-hidden="true"
                />
                <h3 className="font-body text-base font-semibold text-ink">
                  Create your first campaign
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-ink-secondary">
                  Add a map, invite the table, and start a session when you are
                  ready.
                </p>
                <Button
                  onClick={() => setShowCreateModal(true)}
                  icon={Plus}
                  className="mt-5"
                >
                  New campaign
                </Button>
              </div>
            )}

            {!loading && campaigns.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2">
                {campaigns.map((campaign) => (
                  <CampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    userRole={getUserRole(campaign)}
                  />
                ))}
              </div>
            )}
          </section>

          <aside aria-labelledby="quick-access-heading" className="min-w-0">
            <div className="xl:sticky xl:top-5">
              <h3
                id="quick-access-heading"
                className="mb-2 font-body text-sm font-semibold text-ink"
              >
                Quick access
              </h3>
              <div className="overflow-hidden rounded-cozy border border-brand/15 bg-surface-light">
                <button
                  type="button"
                  onClick={() => navigate("/characters")}
                  className="group flex w-full items-center gap-3 border-b border-brand/10 px-3 py-3 text-left hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-cozy bg-spirit/10 text-spirit">
                    <User className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">
                      Characters
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {loading ? "Loading" : `${characters.length} available`}
                    </span>
                  </span>
                  <ArrowRight
                    className="h-4 w-4 text-brand transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </button>

                {!loading &&
                  characters.slice(0, 3).map((character) => (
                    <button
                      key={character.id}
                      type="button"
                      onClick={() => navigate("/characters")}
                      className="flex w-full items-center gap-2.5 border-b border-brand/10 px-3 py-2.5 text-left hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                    >
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-dark">
                        {character.tokenImageUrl ? (
                          <img
                            src={character.tokenImageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <User
                            className="h-3.5 w-3.5 text-brand"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">
                          {character.name}
                        </span>
                        <span className="block truncate text-xs text-ink-muted">
                          {character.gameSystem || "Flexible"}
                        </span>
                      </span>
                    </button>
                  ))}

                <button
                  type="button"
                  onClick={() => navigate("/assets")}
                  className="group flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-cozy bg-accent/15 text-accent-text">
                    <FolderOpen className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">
                      Asset library
                    </span>
                    <span className="block text-xs text-ink-muted">
                      Maps, tokens, audio, and portraits
                    </span>
                  </span>
                  <ArrowRight
                    className="h-4 w-4 text-brand transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <CreateCampaignModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCampaignCreated}
      />
      <CampaignImportDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onSuccess={loadData}
      />
      {selectedInvitation && (
        <InvitationModal
          invitation={selectedInvitation}
          onClose={() => setSelectedInvitation(null)}
          onAccept={() => {
            setSelectedInvitation(null);
            loadData();
          }}
          onDecline={() => {
            setSelectedInvitation(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}
