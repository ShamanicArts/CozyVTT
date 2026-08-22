import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, Power, RefreshCw } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "@/components/ui/Button";
import { api } from "@/services/api";
import type { ExtensionInstallation } from "@/types/extensions";

function list(values: string[] | undefined): string {
  return values?.length ? values.join(", ") : "None declared";
}

export default function ExtensionSettingsPage() {
  const navigate = useNavigate();
  const { extensionId = "" } = useParams();
  const [installation, setInstallation] = useState<ExtensionInstallation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const installations = await api.listExtensionInstallations();
      const match = installations.find((item) => item.extensionId === extensionId);
      if (!match) setError("This extension is not installed.");
      setInstallation(match ?? null);
    } catch {
      setError("Extension settings could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [extensionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async () => {
    if (!installation) return;
    setBusy(true);
    setError("");
    try {
      const updated =
        installation.state === "active"
          ? await api.deactivateExtension(installation.extensionId)
          : await api.activateExtension(installation.extensionId);
      setInstallation(updated);
      window.dispatchEvent(new Event("cozyvtt:extensions-changed"));
    } catch {
      setError("The extension lifecycle change failed.");
    } finally {
      setBusy(false);
    }
  };

  const manifest = installation?.packageManifest.manifest;
  const contributions = installation?.packageManifest.contributions;

  return (
    <main className="min-h-screen bg-canvas px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-moss-green/15 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              iconOnly
              aria-label="Back to extensions"
              onClick={() => navigate("/admin?tab=extensions")}
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-moss-green">
                {manifest?.name || installation?.extensionId || "Extension settings"}
              </h1>
              {installation && (
                <p className="mt-0.5 truncate text-sm text-warm-gray">
                  {installation.extensionId} · v{installation.version}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              icon={RefreshCw}
              onClick={() => void load()}
              disabled={loading || busy}
              size="sm"
            >
              Refresh
            </Button>
            {installation && (
              <Button
                variant={installation.state === "active" ? "secondary" : "primary"}
                icon={Power}
                onClick={() => void toggle()}
                loading={busy}
                size="sm"
              >
                {installation.state === "active" ? "Deactivate" : "Activate"}
              </Button>
            )}
          </div>
        </header>

        {error && (
          <p role="alert" className="mt-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        {loading ? (
          <div className="mt-8 space-y-3" aria-label="Loading extension settings">
            <div className="h-5 w-48 animate-pulse rounded bg-moss-green/10" />
            <div className="h-20 animate-pulse rounded-lg bg-moss-green/5" />
            <div className="h-32 animate-pulse rounded-lg bg-moss-green/5" />
          </div>
        ) : installation ? (
          <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="min-w-0 space-y-8">
              <section aria-labelledby="extension-about">
                <h2 id="extension-about" className="text-base font-semibold text-stone-gray">About</h2>
                <p className="mt-2 max-w-[70ch] text-sm leading-6 text-warm-gray">
                  {manifest?.description || "No description provided."}
                </p>
              </section>

              <section className="border-t border-moss-green/10 pt-6" aria-labelledby="extension-access">
                <h2 id="extension-access" className="text-base font-semibold text-stone-gray">Access</h2>
                <dl className="mt-3 divide-y divide-moss-green/10 text-sm">
                  <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
                    <dt className="font-medium text-stone-gray">Permissions</dt>
                    <dd className="break-words text-warm-gray">{list(manifest?.permissions)}</dd>
                  </div>
                  <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
                    <dt className="font-medium text-stone-gray">Capabilities</dt>
                    <dd className="break-words text-warm-gray">{list(manifest?.capabilities)}</dd>
                  </div>
                </dl>
              </section>

              <section className="border-t border-moss-green/10 pt-6" aria-labelledby="extension-features">
                <h2 id="extension-features" className="text-base font-semibold text-stone-gray">Features</h2>
                <div className="mt-3 divide-y divide-moss-green/10">
                  {(manifest?.commands ?? []).map((command) => (
                    <div key={command.id} className="py-3">
                      <p className="text-sm font-medium text-stone-gray">{command.title}</p>
                      <p className="mt-0.5 text-xs text-warm-gray">{command.id}</p>
                      <p className="mt-1 max-w-[70ch] text-sm text-warm-gray">{command.description}</p>
                    </div>
                  ))}
                  {(manifest?.publishedCapabilities ?? []).map((capability) => (
                    <div key={capability.id} className="py-3">
                      <p className="text-sm font-medium text-stone-gray">{capability.title}</p>
                      <p className="mt-0.5 text-xs text-warm-gray">{capability.id}</p>
                      <p className="mt-1 max-w-[70ch] text-sm text-warm-gray">{capability.description}</p>
                    </div>
                  ))}
                  {(manifest?.httpRoutes ?? []).map((route) => (
                    <div key={route.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                      <span className="rounded bg-moss-green/10 px-2 py-1 text-xs font-semibold text-moss-green">{route.method}</span>
                      <span className="text-stone-gray">{route.path}</span>
                    </div>
                  ))}
                  {!manifest?.commands?.length && !manifest?.publishedCapabilities?.length && !manifest?.httpRoutes?.length && (
                    <p className="py-3 text-sm text-warm-gray">No user-facing features declared.</p>
                  )}
                </div>
              </section>

              {(contributions?.themes?.length || contributions?.renderers?.length) ? (
                <section className="border-t border-moss-green/10 pt-6" aria-labelledby="extension-contributions">
                  <h2 id="extension-contributions" className="text-base font-semibold text-stone-gray">Contributions</h2>
                  <dl className="mt-3 divide-y divide-moss-green/10 text-sm">
                    {contributions.themes?.map((theme) => (
                      <div key={theme.id} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
                        <dt className="font-medium text-stone-gray">Theme</dt>
                        <dd className="text-warm-gray">{theme.name}</dd>
                      </div>
                    ))}
                    {contributions.renderers?.map((renderer) => (
                      <div key={renderer.id} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
                        <dt className="font-medium text-stone-gray">Renderer</dt>
                        <dd className="text-warm-gray">{renderer.name}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : null}
            </div>

            <aside className="lg:border-l lg:border-moss-green/10 lg:pl-6" aria-label="Installation details">
              <div className="flex items-center gap-2">
                {installation.state === "active" ? (
                  <CheckCircle2 className="h-4 w-4 text-moss-green" aria-hidden="true" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-warm-amber" aria-hidden="true" />
                )}
                <span className="text-sm font-semibold capitalize text-stone-gray">{installation.state}</span>
              </div>
              <dl className="mt-4 space-y-4 text-sm">
                <div>
                  <dt className="text-xs font-medium text-warm-gray">Execution</dt>
                  <dd className="mt-1 capitalize text-stone-gray">{installation.installMode}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-warm-gray">Installed</dt>
                  <dd className="mt-1 text-stone-gray">{new Date(installation.installedAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-warm-gray">Package checksum</dt>
                  <dd className="mt-1 break-all font-mono text-xs text-stone-gray">{installation.packageChecksum}</dd>
                </div>
              </dl>
            </aside>
          </div>
        ) : null}
      </div>
    </main>
  );
}
