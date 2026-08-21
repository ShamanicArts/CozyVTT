import {
  createContext,
  useContext,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type {
  ResolvedWorkspaceContribution,
  WorkspaceLayoutContext,
  WorkspaceLayoutRegion,
} from "./contracts";
import { WorkspaceLayoutHost } from "./WorkspaceLayoutHost";

const WorkspaceLayoutHostContext = createContext<WorkspaceLayoutHost | null>(
  null,
);

export function WorkspaceLayoutProvider({ children }: { children: ReactNode }) {
  const hostRef = useRef<WorkspaceLayoutHost | null>(null);
  if (hostRef.current === null) hostRef.current = new WorkspaceLayoutHost();

  return (
    <WorkspaceLayoutHostContext.Provider value={hostRef.current}>
      {children}
    </WorkspaceLayoutHostContext.Provider>
  );
}

export function useWorkspaceLayoutHost(): WorkspaceLayoutHost {
  const host = useContext(WorkspaceLayoutHostContext);
  if (!host) {
    throw new Error(
      "Workspace layout contributions require a WorkspaceLayoutProvider.",
    );
  }
  return host;
}

export function useWorkspaceRegion(
  region: WorkspaceLayoutRegion,
  layoutContext: WorkspaceLayoutContext,
): readonly ResolvedWorkspaceContribution[] {
  const host = useWorkspaceLayoutHost();
  useSyncExternalStore(
    (listener) => host.subscribe(listener),
    host.getRevision,
    host.getRevision,
  );
  return host.list(region, layoutContext);
}
