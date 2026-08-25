import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { activateGameSystemContributions } from './contributions';

export function GameSystemContributionProvider({ children }: { children: ReactNode }) {
  const { authenticated } = useAuth();
  const [contributionRevision, setContributionRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setContributionRevision((revision) => revision + 1);
    window.addEventListener('cozyvtt:extensions-changed', refresh);
    return () => window.removeEventListener('cozyvtt:extensions-changed', refresh);
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    let disposed = false;
    let deactivate: (() => void) | undefined;
    void api.listActiveExtensionContributions()
      .then((contributions) => activateGameSystemContributions(contributions.gameSystems ?? []))
      .then((cleanup) => {
        if (disposed) cleanup();
        else deactivate = cleanup;
      })
      .catch((error) => console.error('[CozyVTT game system] Contribution loading failed.', error));
    return () => {
      disposed = true;
      deactivate?.();
    };
  }, [authenticated, contributionRevision]);

  return children;
}
