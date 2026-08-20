import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  PackagePlus,
  Play,
  RefreshCw,
  Shield,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/services/api";
import type { Campaign } from "@/types";
import type {
  ExtensionGrant,
  ExtensionGrantPermission,
  ExtensionGrantPrincipal,
  ExtensionInstallation,
  ExtensionInstallMode,
  ExtensionPackage,
} from "@/types/extensions";
import Button from "@/components/ui/Button";

const grantPermissions: ExtensionGrantPermission[] = [
  "READ",
  "WRITE",
  "EXECUTE",
  "ADMIN",
];
const grantPrincipals: ExtensionGrantPrincipal[] = ["USER", "AGENT", "SYSTEM"];

function date(value: string | null): string {
  return value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Never";
}

function lifecycleNotice(installation: ExtensionInstallation): string {
  if (installation.state === "error")
    return installation.lastError || "The last lifecycle operation failed.";
  return installation.installMode === "sandboxed"
    ? "Sandboxed extensions run outside the server process. Grant only the permissions they need."
    : "Trusted extensions can execute in the server process. Install only reviewed packages.";
}

export default function ExtensionManagement() {
  const [packages, setPackages] = useState<ExtensionPackage[]>([]);
  const [installations, setInstallations] = useState<ExtensionInstallation[]>(
    [],
  );
  const [grants, setGrants] = useState<ExtensionGrant[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [grantForm, setGrantForm] = useState({
    principalType: "SYSTEM" as ExtensionGrantPrincipal,
    principalId: "",
    scopeCampaignId: "",
    extensionId: "",
    permission: "READ" as ExtensionGrantPermission,
    expiresAt: "",
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [available, installed, activeGrants, campaignResult] =
        await Promise.all([
          api.listExtensionPackages(),
          api.listExtensionInstallations(),
          api.listExtensionGrants(),
          api.adminListAllCampaigns(),
        ]);
      setPackages(available);
      setInstallations(installed);
      setGrants(activeGrants);
      setCampaigns(campaignResult.campaigns);
      setGrantForm((current) => ({
        ...current,
        extensionId:
          current.extensionId ||
          installed[0]?.extensionId ||
          available[0]?.id ||
          "",
        scopeCampaignId:
          current.scopeCampaignId || campaignResult.campaigns[0]?.id || "",
      }));
    } catch {
      setError(
        "Extensions could not be loaded. Check that the extension host is configured, then refresh.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const byId = useMemo(
    () =>
      new Map(
        installations.map((installation) => [
          installation.extensionId,
          installation,
        ]),
      ),
    [installations],
  );
  const extensionOptions = useMemo(
    () => [
      ...new Set([
        ...installations.map((item) => item.extensionId),
        ...packages.map((item) => item.id),
      ]),
    ],
    [installations, packages],
  );

  const changed = () => {
    window.dispatchEvent(new Event("cozyvtt:extensions-changed"));
    void refresh();
  };

  const install = async (packageId: string, mode: ExtensionInstallMode) => {
    setBusy(`install:${packageId}:${mode}`);
    setError("");
    try {
      await api.installExtension(packageId, mode);
      changed();
    } catch {
      setError(
        "This package could not be installed. Its trust policy or dependencies may need attention.",
      );
    } finally {
      setBusy(null);
    }
  };

  const lifecycle = async (
    installation: ExtensionInstallation,
    action: "activate" | "deactivate" | "uninstall",
  ) => {
    setBusy(`${action}:${installation.extensionId}`);
    setError("");
    try {
      if (action === "activate")
        await api.activateExtension(installation.extensionId);
      if (action === "deactivate")
        await api.deactivateExtension(installation.extensionId);
      if (action === "uninstall")
        await api.uninstallExtension(installation.extensionId);
      changed();
    } catch {
      setError(
        `The extension could not be ${action}d. Active dependencies and trust checks can block lifecycle changes.`,
      );
    } finally {
      setBusy(null);
    }
  };

  const createGrant = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !grantForm.principalId.trim() ||
      !grantForm.scopeCampaignId ||
      !grantForm.extensionId
    )
      return;
    setBusy("grant:create");
    setError("");
    try {
      const grant = await api.createExtensionGrant({
        ...grantForm,
        principalId: grantForm.principalId.trim(),
        expiresAt: grantForm.expiresAt
          ? new Date(grantForm.expiresAt).toISOString()
          : null,
      });
      setGrants((current) => [grant, ...current]);
      setGrantForm((current) => ({
        ...current,
        principalId: "",
        expiresAt: "",
      }));
    } catch {
      setError(
        "The grant could not be saved. Check the campaign, principal, and permission.",
      );
    } finally {
      setBusy(null);
    }
  };

  const revokeGrant = async (grantId: string) => {
    setBusy(`grant:${grantId}`);
    try {
      await api.revokeExtensionGrant(grantId);
      setGrants((current) => current.filter((grant) => grant.id !== grantId));
    } catch {
      setError("The grant could not be revoked. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="space-y-7"
      role="tabpanel"
      id="tabpanel-extensions"
      aria-labelledby="tab-extensions"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-moss-green">Extensions</h2>
          <p className="mt-1 max-w-2xl text-sm text-warm-gray">
            Review local packages and choose their execution boundary. MCP users
            authorize themselves through their existing campaign role.
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

      <section
        className="space-y-3"
        aria-labelledby="available-packages-heading"
      >
        <div className="flex items-center gap-2">
          <PackagePlus className="h-4 w-4 text-moss-green" aria-hidden="true" />
          <h3
            id="available-packages-heading"
            className="font-semibold text-moss-green"
          >
            Available packages
          </h3>
        </div>
        {loading ? (
          <p className="text-sm text-warm-gray">Loading packages…</p>
        ) : packages.length === 0 ? (
          <p className="text-sm text-warm-gray">
            No package catalogue is configured.
          </p>
        ) : (
          <ul className="divide-y divide-moss-green/10 overflow-hidden rounded-lg border border-moss-green/15 bg-paper">
            {packages.map((pkg) => {
              const existing = byId.get(pkg.id);
              return (
                <li
                  key={pkg.id}
                  className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-stone-gray">
                      {pkg.id}{" "}
                      <span className="text-xs font-normal text-warm-gray">
                        v{pkg.version}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-warm-gray">
                      {Object.keys(pkg.dependencies).length
                        ? `${Object.keys(pkg.dependencies).length} dependencies`
                        : "No declared dependencies"}
                      {existing ? ` · ${existing.state}` : ""}
                    </p>
                  </div>
                  {existing ? (
                    <span className="text-sm text-warm-gray">
                      Installed as {existing.installMode}
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => void install(pkg.id, "sandboxed")}
                        disabled={busy !== null}
                        variant="secondary"
                        className="text-sm"
                      >
                        {busy === `install:${pkg.id}:sandboxed` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Install sandboxed"
                        )}
                      </Button>
                      <Button
                        onClick={() => void install(pkg.id, "trusted")}
                        disabled={busy !== null}
                        className="text-sm"
                      >
                        {busy === `install:${pkg.id}:trusted` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Install trusted"
                        )}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        className="space-y-3"
        aria-labelledby="installed-extensions-heading"
      >
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-moss-green" aria-hidden="true" />
          <h3
            id="installed-extensions-heading"
            className="font-semibold text-moss-green"
          >
            Installed extensions
          </h3>
        </div>
        {loading ? (
          <p className="text-sm text-warm-gray">Loading installations…</p>
        ) : installations.length === 0 ? (
          <p className="text-sm text-warm-gray">No extensions are installed.</p>
        ) : (
          <ul className="divide-y divide-moss-green/10 overflow-hidden rounded-lg border border-moss-green/15 bg-paper">
            {installations.map((installation) => (
              <li
                key={installation.extensionId}
                className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-stone-gray">
                      {installation.extensionId}
                    </p>
                    <span className="rounded-full border border-moss-green/20 bg-moss-green/10 px-2 py-0.5 text-xs font-medium text-moss-green">
                      {installation.state}
                    </span>
                    <span className="rounded-full border border-warm-amber/30 bg-warm-amber/10 px-2 py-0.5 text-xs text-stone-gray">
                      {installation.installMode}
                    </span>
                  </div>
                  <p className="mt-1 max-w-2xl text-xs text-warm-gray">
                    {lifecycleNotice(installation)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {installation.state !== "active" && (
                    <Button
                      onClick={() => void lifecycle(installation, "activate")}
                      disabled={busy !== null}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Play className="h-4 w-4" aria-hidden="true" />
                      Activate
                    </Button>
                  )}
                  {installation.state === "active" && (
                    <Button
                      onClick={() => void lifecycle(installation, "deactivate")}
                      disabled={busy !== null}
                      variant="secondary"
                      className="text-sm"
                    >
                      Deactivate
                    </Button>
                  )}
                  <Button
                    onClick={() => void lifecycle(installation, "uninstall")}
                    disabled={busy !== null}
                    variant="secondary"
                    className="flex items-center gap-2 text-sm"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Uninstall
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="space-y-4 border-t border-moss-green/10 pt-6"
        aria-labelledby="extension-grants-heading"
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-warm-amber" aria-hidden="true" />
          <div>
            <h3
              id="extension-grants-heading"
              className="font-semibold text-moss-green"
            >
              Advanced service grants
            </h3>
            <p className="mt-1 text-sm text-warm-gray">
              Optional grants for unattended system or service principals.
              Normal user MCP connections do not require anything here.
            </p>
          </div>
        </div>
        <form
          onSubmit={createGrant}
          className="grid gap-3 rounded-lg border border-moss-green/15 bg-paper p-4 md:grid-cols-2 xl:grid-cols-3"
        >
          <label className="text-sm font-medium text-stone-gray">
            Principal type
            <select
              value={grantForm.principalType}
              onChange={(event) =>
                setGrantForm((current) => ({
                  ...current,
                  principalType: event.target.value as ExtensionGrantPrincipal,
                }))
              }
              className="input-cozy mt-1 w-full"
            >
              {grantPrincipals.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-stone-gray">
            Principal ID
            <input
              value={grantForm.principalId}
              onChange={(event) =>
                setGrantForm((current) => ({
                  ...current,
                  principalId: event.target.value,
                }))
              }
              className="input-cozy mt-1 w-full"
              placeholder="User, agent, or extension ID"
              required
            />
          </label>
          <label className="text-sm font-medium text-stone-gray">
            Campaign
            <select
              value={grantForm.scopeCampaignId}
              onChange={(event) =>
                setGrantForm((current) => ({
                  ...current,
                  scopeCampaignId: event.target.value,
                }))
              }
              className="input-cozy mt-1 w-full"
              required
            >
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-stone-gray">
            Extension
            <select
              value={grantForm.extensionId}
              onChange={(event) =>
                setGrantForm((current) => ({
                  ...current,
                  extensionId: event.target.value,
                }))
              }
              className="input-cozy mt-1 w-full"
              required
            >
              {extensionOptions.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-stone-gray">
            Permission
            <select
              value={grantForm.permission}
              onChange={(event) =>
                setGrantForm((current) => ({
                  ...current,
                  permission: event.target.value as ExtensionGrantPermission,
                }))
              }
              className="input-cozy mt-1 w-full"
            >
              {grantPermissions.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-stone-gray">
            Expires
            <input
              type="datetime-local"
              value={grantForm.expiresAt}
              onChange={(event) =>
                setGrantForm((current) => ({
                  ...current,
                  expiresAt: event.target.value,
                }))
              }
              className="input-cozy mt-1 w-full"
            />
          </label>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={
                busy !== null ||
                !grantForm.principalId.trim() ||
                !grantForm.scopeCampaignId ||
                !grantForm.extensionId
              }
              className="w-full text-sm"
            >
              {busy === "grant:create" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Create grant"
              )}
            </Button>
          </div>
        </form>
        {grants.length === 0 ? (
          <p className="text-sm text-warm-gray">
            No campaign grants have been created.
          </p>
        ) : (
          <ul className="divide-y divide-moss-green/10 overflow-hidden rounded-lg border border-moss-green/15 bg-paper">
            {grants.map((grant) => (
              <li
                key={grant.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-sm text-stone-gray">
                  <span className="font-medium">{grant.principalType}</span>{" "}
                  {grant.principalId} · {grant.extensionId} · {grant.permission}
                  <span className="block text-xs text-warm-gray">
                    Campaign{" "}
                    {campaigns.find(
                      (campaign) => campaign.id === grant.scopeCampaignId,
                    )?.name ?? grant.scopeCampaignId}{" "}
                    · expires {date(grant.expiresAt)}
                  </span>
                </p>
                <Button
                  onClick={() => void revokeGrant(grant.id)}
                  disabled={busy !== null}
                  variant="secondary"
                  className="flex items-center gap-2 text-sm"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
