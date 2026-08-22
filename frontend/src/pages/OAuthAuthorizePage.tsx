import { useEffect, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import Button from "@/components/ui/Button";
import { api } from "@/services/api";
import type { OAuthConsentRequest } from "@/types/extensions";

/** One human decision replaces manual tokens and administrator grants. */
export default function OAuthAuthorizePage() {
  const [search] = useSearchParams();
  const requestId = search.get("request") ?? "";
  const [request, setRequest] = useState<OAuthConsentRequest | null>(null);
  const [campaignId, setCampaignId] = useState("");
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!requestId) {
      setError("This connection request is missing.");
      return;
    }
    api
      .getOAuthConsentRequest(requestId)
      .then((result) => {
        setRequest(result);
        setCampaignId(result.campaigns[0]?.id ?? "");
      })
      .catch(() =>
        setError(
          "This connection request has expired or was already used.",
        ),
      );
  }, [requestId]);

  const approve = async () => {
    if (!campaignId) return;
    setBusy("approve");
    setError("");
    try {
      const { redirectUrl } = await api.approveOAuthConsent(
        requestId,
        campaignId,
      );
      window.location.assign(redirectUrl);
    } catch {
      setError(
        "CozyVTT could not authorize this connection. Try again from your client.",
      );
      setBusy(null);
    }
  };

  const deny = async () => {
    setBusy("deny");
    setError("");
    try {
      const { redirectUrl } = await api.denyOAuthConsent(requestId);
      window.location.assign(redirectUrl);
    } catch {
      setError("This connection request is no longer available.");
      setBusy(null);
    }
  };

  return (
    <main
      id="main-content"
      className="min-h-screen flex items-center justify-center px-4"
    >
      <section className="glass-panel w-full max-w-lg space-y-6 p-8">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-moss-green/10 p-3 text-moss-green">
            <Link2 className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-heading text-moss-green">
              Connect CozyVTT
            </h1>
            <p className="mt-1 text-sm text-warm-gray">
              One approval connects this client. There are no API keys or
              administrator grants to configure.
            </p>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-spirit-red/10 p-3 text-sm text-spirit-red"
          >
            {error}
          </p>
        )}

        {!request && !error && (
          <div className="flex items-center gap-2 text-sm text-warm-gray">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading connection…
          </div>
        )}

        {request && (
          <>
            <div className="rounded-lg border border-moss-green/15 bg-paper p-4">
              <p className="text-sm text-warm-gray">Client</p>
              <p className="font-semibold text-stone-gray">
                {request.clientName}
              </p>
              <p className="mt-3 text-sm text-warm-gray">Plugin resource</p>
              <p className="font-medium text-stone-gray">
                {request.resource.pluginId} / {request.resource.resourceId}
              </p>
              {request.resource.scopes.length > 0 && (
                <p className="mt-1 text-xs text-warm-gray">
                  Access: {request.resource.scopes.join(", ")}
                </p>
              )}
            </div>

            <label className="block text-sm font-medium text-stone-gray">
              Use this campaign
              <select
                value={campaignId}
                onChange={(event) => setCampaignId(event.target.value)}
                className="input-cozy mt-1 w-full"
              >
                {request.campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name} · {campaign.role.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>

            <p className="text-sm text-warm-gray">
              The client acts as you inside this campaign. Your existing DM,
              player, or spectator permissions remain the only authority.
            </p>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void deny()}
              >
                Deny
              </Button>
              <Button
                disabled={busy !== null || !campaignId}
                onClick={() => void approve()}
                className="flex items-center justify-center gap-2"
              >
                {busy === "approve" && (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                Allow connection
              </Button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
