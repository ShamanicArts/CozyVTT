import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { api } from "@/services/api";
import type { Campaign } from "@/types";
import type {
  AgentCredential,
  PendingAgentConfirmation,
} from "@/types/extensions";
import Button from "@/components/ui/Button";

function formatDate(value: string | null): string {
  if (!value) return "No expiry";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Human-owned controls for issuing and supervising campaign-scoped agent access. */
export default function AgentAccessPanel() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [credentials, setCredentials] = useState<AgentCredential[]>([]);
  const [confirmations, setConfirmations] = useState<
    PendingAgentConfirmation[]
  >([]);
  const [campaignId, setCampaignId] = useState("");
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [revealedReceipt, setRevealedReceipt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [campaignResult, credentialResult, confirmationResult] =
        await Promise.all([
          api.listCampaigns(),
          api.listAgentCredentials(),
          api.listPendingAgentConfirmations(),
        ]);
      setCampaigns(campaignResult.campaigns);
      setCredentials(credentialResult);
      setConfirmations(confirmationResult);
      setCampaignId(
        (current) => current || campaignResult.campaigns[0]?.id || "",
      );
    } catch {
      setError("Agent access could not be loaded. Try refreshing this panel.");
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

  const copySecret = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      setError(
        "Clipboard access was unavailable. Select and copy the value manually.",
      );
    }
  };

  const issue = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!campaignId || !label.trim()) return;
    setIssuing(true);
    setError("");
    try {
      const result = await api.issueAgentCredential({
        campaignId,
        label: label.trim(),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      setCredentials((current) => [result.credential, ...current]);
      setRevealedToken(result.token);
      setLabel("");
      setExpiresAt("");
    } catch {
      setError(
        "The credential could not be issued. Check the campaign and expiry, then try again.",
      );
    } finally {
      setIssuing(false);
    }
  };

  const revoke = async (credentialId: string) => {
    setBusyId(credentialId);
    try {
      await api.revokeAgentCredential(credentialId);
      setCredentials((current) =>
        current.map((credential) =>
          credential.id === credentialId
            ? { ...credential, revokedAt: new Date().toISOString() }
            : credential,
        ),
      );
    } catch {
      setError("The credential could not be revoked. Try again.");
    } finally {
      setBusyId(null);
    }
  };

  const decide = async (
    confirmation: PendingAgentConfirmation,
    approved: boolean,
  ) => {
    setBusyId(confirmation.id);
    try {
      if (approved) {
        const result = await api.approveAgentConfirmation(confirmation.id);
        setRevealedReceipt(result.receipt);
      } else {
        await api.denyAgentConfirmation(confirmation.id);
      }
      setConfirmations((current) =>
        current.filter((item) => item.id !== confirmation.id),
      );
    } catch {
      setError(
        `This request could not be ${approved ? "approved" : "denied"}. Try again.`,
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      className="glass-panel p-6 space-y-6"
      aria-labelledby="agent-access-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="agent-access-heading"
            className="text-xl font-semibold text-moss-green"
          >
            Agent Access
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-warm-gray">
            Create narrowly scoped campaign credentials and review actions that
            need your approval.
          </p>
        </div>
        <Button
          onClick={() => void refresh()}
          variant="secondary"
          disabled={loading}
          className="flex items-center gap-2 text-sm"
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          Refresh
        </Button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {revealedToken && (
        <div
          className="rounded-lg border border-warm-amber/40 bg-warm-amber/10 p-4"
          role="status"
        >
          <p className="text-sm font-medium text-stone-gray">
            Copy this credential now. It will not be shown again.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 break-all rounded bg-paper px-3 py-2 text-xs text-stone-gray">
              {revealedToken}
            </code>
            <Button
              onClick={() => void copySecret(revealedToken)}
              variant="secondary"
              className="shrink-0 flex items-center gap-2 text-sm"
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              onClick={() => setRevealedToken(null)}
              variant="secondary"
              className="shrink-0 text-sm"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {revealedReceipt && (
        <div
          className="rounded-lg border border-moss-green/30 bg-moss-green/10 p-4"
          role="status"
        >
          <p className="text-sm font-medium text-stone-gray">
            Approval receipt, share it only with the waiting agent.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 break-all rounded bg-paper px-3 py-2 text-xs text-stone-gray">
              {revealedReceipt}
            </code>
            <Button
              onClick={() => void copySecret(revealedReceipt)}
              variant="secondary"
              className="shrink-0 flex items-center gap-2 text-sm"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copy
            </Button>
            <Button
              onClick={() => setRevealedReceipt(null)}
              variant="secondary"
              className="shrink-0 text-sm"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <form
        onSubmit={issue}
        className="grid gap-3 border-y border-moss-green/10 py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] md:items-end"
      >
        <label className="block text-sm font-medium text-stone-gray">
          Campaign
          <select
            value={campaignId}
            onChange={(event) => setCampaignId(event.target.value)}
            className="input-cozy mt-1 w-full"
            required
          >
            {campaigns.length === 0 && (
              <option value="">No available campaigns</option>
            )}
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-stone-gray">
          Label
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className="input-cozy mt-1 w-full"
            maxLength={120}
            placeholder="Session helper"
            required
          />
        </label>
        <label className="block text-sm font-medium text-stone-gray">
          Expires
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            className="input-cozy mt-1 w-full"
          />
        </label>
        <Button
          type="submit"
          disabled={issuing || !campaignId || !label.trim()}
          className="flex items-center justify-center gap-2 text-sm"
        >
          {issuing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <KeyRound className="h-4 w-4" aria-hidden="true" />
          )}
          Issue credential
        </Button>
      </form>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-moss-green" aria-hidden="true" />
          <h3 className="font-semibold text-moss-green">Pending approvals</h3>
        </div>
        {loading ? (
          <p className="text-sm text-warm-gray">Loading requests…</p>
        ) : confirmations.length === 0 ? (
          <p className="text-sm text-warm-gray">
            Nothing is waiting for approval.
          </p>
        ) : (
          <ul className="divide-y divide-moss-green/10 rounded-lg border border-moss-green/15 bg-paper">
            {confirmations.map((confirmation) => (
              <li
                key={confirmation.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-stone-gray">
                    {confirmation.commandId}
                  </p>
                  <p className="mt-1 text-xs text-warm-gray">
                    {campaignNames.get(confirmation.campaignId) ??
                      confirmation.campaignId}{" "}
                    · requested {formatDate(confirmation.createdAt)} · expires{" "}
                    {formatDate(confirmation.expiresAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => void decide(confirmation, true)}
                    disabled={busyId === confirmation.id}
                    className="text-sm"
                  >
                    {busyId === confirmation.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Approve"
                    )}
                  </Button>
                  <Button
                    onClick={() => void decide(confirmation, false)}
                    disabled={busyId === confirmation.id}
                    variant="secondary"
                    className="text-sm"
                  >
                    Deny
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-moss-green">Issued credentials</h3>
        {loading ? (
          <p className="text-sm text-warm-gray">Loading credentials…</p>
        ) : credentials.length === 0 ? (
          <p className="text-sm text-warm-gray">
            No credentials have been issued.
          </p>
        ) : (
          <ul className="divide-y divide-moss-green/10 rounded-lg border border-moss-green/15 bg-paper">
            {credentials.map((credential) => (
              <li
                key={credential.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-stone-gray">
                    {credential.label}
                  </p>
                  <p className="mt-1 text-xs text-warm-gray">
                    {campaignNames.get(credential.campaignId) ??
                      credential.campaignId}{" "}
                    ·{" "}
                    {credential.revokedAt
                      ? "Revoked"
                      : formatDate(credential.expiresAt)}
                  </p>
                </div>
                {!credential.revokedAt && (
                  <Button
                    onClick={() => void revoke(credential.id)}
                    disabled={busyId === credential.id}
                    variant="secondary"
                    className="flex items-center gap-2 text-sm"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Revoke
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
