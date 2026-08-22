import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { api } from "@/services/api";
import type { Campaign } from "@/types";
import type {
  PendingCapabilityApproval,
  PluginCredential,
} from "@/types/extensions";

function formatDate(value: string | null): string {
  if (!value) return "No expiry";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function ConnectedPluginsPanel() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [credentials, setCredentials] = useState<PluginCredential[]>([]);
  const [approvals, setApprovals] = useState<PendingCapabilityApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [campaignResult, credentialResult, approvalResult] =
        await Promise.all([
          api.listCampaigns(),
          api.listPluginCredentials(),
          api.listPendingCapabilityApprovals(),
        ]);
      setCampaigns(campaignResult.campaigns);
      setCredentials(credentialResult);
      setApprovals(approvalResult);
    } catch {
      setError("Plugin connections could not be loaded. Try refreshing this panel.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const campaignNames = useMemo(
    () => new Map(campaigns.map((campaign) => [campaign.id, campaign.name])),
    [campaigns],
  );

  const revoke = async (credentialId: string) => {
    setBusyId(credentialId);
    try {
      await api.revokePluginCredential(credentialId);
      setCredentials((current) =>
        current.map((credential) =>
          credential.id === credentialId
            ? { ...credential, revokedAt: new Date().toISOString() }
            : credential,
        ),
      );
    } catch {
      setError("The connection could not be revoked. Try again.");
    } finally {
      setBusyId(null);
    }
  };

  const decide = async (approval: PendingCapabilityApproval, approved: boolean) => {
    setBusyId(approval.id);
    try {
      if (approved) await api.approveCapabilityApproval(approval.id);
      else await api.denyCapabilityApproval(approval.id);
      setApprovals((current) => current.filter((item) => item.id !== approval.id));
    } catch {
      setError(`This request could not be ${approved ? "approved" : "denied"}. Try again.`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="glass-panel p-6 space-y-6" aria-labelledby="connected-plugins-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="connected-plugins-heading" className="text-xl font-semibold text-moss-green">
            Connected plugins
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-warm-gray">
            Review campaign-scoped plugin connections and sensitive capability requests.
          </p>
        </div>
        <Button onClick={() => void refresh()} variant="secondary" disabled={loading} className="flex items-center gap-2 text-sm">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger-ink">{error}</p>}

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-moss-green" aria-hidden="true" />
          <h3 className="font-semibold text-moss-green">Pending capability approvals</h3>
        </div>
        {loading ? <p className="text-sm text-warm-gray">Loading requests...</p> : approvals.length === 0 ? (
          <p className="text-sm text-warm-gray">Nothing is waiting for approval.</p>
        ) : (
          <ul className="divide-y divide-moss-green/10 rounded-lg border border-moss-green/15 bg-paper">
            {approvals.map((approval) => (
              <li key={approval.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-stone-gray">{approval.displayMetadata.capabilityTitle}</p>
                  <p className="mt-1 text-sm text-warm-gray">{approval.displayMetadata.riskExplanation}</p>
                  <p className="mt-1 text-xs text-warm-gray">
                    {approval.displayMetadata.integrationLabel} · {approval.displayMetadata.campaignLabel || campaignNames.get(approval.campaignId) || approval.campaignId} · expires {formatDate(approval.expiresAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => void decide(approval, true)} disabled={busyId === approval.id} className="text-sm">
                    {busyId === approval.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
                  </Button>
                  <Button onClick={() => void decide(approval, false)} disabled={busyId === approval.id} variant="secondary" className="text-sm">Reject</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-moss-green">Connections</h3>
        {loading ? <p className="text-sm text-warm-gray">Loading connections...</p> : credentials.length === 0 ? (
          <p className="text-sm text-warm-gray">No plugins are connected.</p>
        ) : (
          <ul className="divide-y divide-moss-green/10 rounded-lg border border-moss-green/15 bg-paper">
            {credentials.map((credential) => (
              <li key={credential.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-stone-gray">{credential.label}</p>
                  <p className="mt-1 text-xs text-warm-gray">
                    {campaignNames.get(credential.campaignId) ?? credential.campaignId} · {credential.revokedAt ? "Revoked" : formatDate(credential.expiresAt)}
                  </p>
                </div>
                {!credential.revokedAt && (
                  <Button onClick={() => void revoke(credential.id)} disabled={busyId === credential.id} variant="secondary" className="flex items-center gap-2 text-sm">
                    <Trash2 className="h-4 w-4" aria-hidden="true" /> Disconnect
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
