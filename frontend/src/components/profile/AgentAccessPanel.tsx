import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import Button from "@/components/ui/Button";
import { api } from "@/services/api";
import type { Campaign } from "@/types";
import type {
  AgentCredential,
  PendingAgentConfirmation,
} from "@/types/extensions";

function formatDate(value: string | null): string {
  if (!value) return "No expiry";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** One-URL MCP setup plus human review for genuinely sensitive actions. */
export default function AgentAccessPanel() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [credentials, setCredentials] = useState<AgentCredential[]>([]);
  const [confirmations, setConfirmations] = useState<
    PendingAgentConfirmation[]
  >([]);
  const [setupUrl, setSetupUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [campaignResult, credentialResult, confirmationResult, setup] =
        await Promise.all([
          api.listCampaigns(),
          api.listAgentCredentials(),
          api.listPendingAgentConfirmations(),
          api.getMcpSetup(),
        ]);
      setCampaigns(campaignResult.campaigns);
      setCredentials(credentialResult);
      setConfirmations(confirmationResult);
      setSetupUrl(setup.url);
    } catch {
      setError(
        "MCP connections could not be loaded. Try refreshing this panel.",
      );
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

  const copySetupUrl = async () => {
    try {
      await navigator.clipboard.writeText(setupUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      setError(
        "Clipboard access was unavailable. Select and copy the URL manually.",
      );
    }
  };

  const downloadSetup = () => {
    const config = JSON.stringify(
      { mcpServers: { cozyvtt: { type: "http", url: setupUrl } } },
      null,
      2,
    );
    const href = URL.createObjectURL(
      new Blob([config], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = href;
    link.download = "cozyvtt.mcp.json";
    link.click();
    URL.revokeObjectURL(href);
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
      setError("The connection could not be revoked. Try again.");
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
      if (approved) await api.approveAgentConfirmation(confirmation.id);
      else await api.denyAgentConfirmation(confirmation.id);
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
            MCP connections
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-warm-gray">
            Add one URL to your MCP client. CozyVTT opens a normal sign-in and
            one-click campaign approval—no API keys or administrator grants.
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

      <div className="rounded-xl border border-moss-green/20 bg-paper p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Link2
            className="mt-0.5 h-5 w-5 text-moss-green"
            aria-hidden="true"
          />
          <div>
            <h3 className="font-semibold text-moss-green">Connect CozyVTT</h3>
            <p className="mt-1 text-sm text-warm-gray">
              Your MCP client will open CozyVTT so you can choose a campaign and
              click Allow. It then stores and refreshes its own connection.
            </p>
          </div>
        </div>
        <code className="block break-all rounded-lg bg-soft-cream px-3 py-2 text-xs text-stone-gray">
          {setupUrl || "Loading MCP URL…"}
        </code>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void copySetupUrl()}
            disabled={!setupUrl}
            className="flex items-center gap-2 text-sm"
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? "Copied" : "Copy MCP URL"}
          </Button>
          <Button
            onClick={downloadSetup}
            disabled={!setupUrl}
            variant="secondary"
            className="flex items-center gap-2 text-sm"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download setup
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-moss-green" aria-hidden="true" />
          <h3 className="font-semibold text-moss-green">
            Pending sensitive actions
          </h3>
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
                    · expires {formatDate(confirmation.expiresAt)}
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
        <h3 className="font-semibold text-moss-green">Connected clients</h3>
        {loading ? (
          <p className="text-sm text-warm-gray">Loading connections…</p>
        ) : credentials.length === 0 ? (
          <p className="text-sm text-warm-gray">
            No MCP clients are connected.
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
                    Disconnect
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
