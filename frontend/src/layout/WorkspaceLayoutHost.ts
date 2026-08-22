import {
  WORKSPACE_LAYOUT_CONTRACT_VERSION,
  workspaceLayoutRegions,
  type ResolvedWorkspaceContribution,
  type WorkspaceContributionPlacement,
  type WorkspaceLayoutContext,
  type WorkspaceLayoutContribution,
  type WorkspaceLayoutRegistration,
  type WorkspaceLayoutRegion,
} from "./contracts";

interface RegisteredContribution {
  readonly contribution: WorkspaceLayoutContribution;
  readonly sequence: number;
  placement: WorkspaceContributionPlacement;
}

export class WorkspaceLayoutRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceLayoutRegistrationError";
  }
}

/**
 * Lifecycle owner for the known regions of one workspace shell.
 *
 * The host deliberately owns placement and visibility while contributions own
 * only their content. Registration handles are identity-safe: an old disposer
 * can never remove a later registration that happens to reuse the same id.
 */
export class WorkspaceLayoutHost {
  private readonly contributions = new Map<string, RegisteredContribution>();
  private readonly listeners = new Set<() => void>();
  private nextSequence = 0;
  private revision = 0;

  register(
    contribution: WorkspaceLayoutContribution,
  ): WorkspaceLayoutRegistration {
    this.validateContribution(contribution);
    if (this.contributions.has(contribution.id)) {
      throw new WorkspaceLayoutRegistrationError(
        `Workspace contribution "${contribution.id}" is already registered.`,
      );
    }

    const registered: RegisteredContribution = {
      contribution,
      sequence: this.nextSequence++,
      placement: {},
    };
    this.contributions.set(contribution.id, registered);
    this.emit();

    return {
      update: (placement) => {
        if (this.contributions.get(contribution.id) !== registered) return;
        this.validatePlacement(contribution, placement);
        registered.placement = { ...registered.placement, ...placement };
        this.emit();
      },
      dispose: () => {
        if (this.contributions.get(contribution.id) !== registered) return;
        this.contributions.delete(contribution.id);
        this.emit();
      },
    };
  }

  unregister(id: string, ownerId: string): boolean {
    const registered = this.contributions.get(id);
    if (!registered || registered.contribution.ownerId !== ownerId)
      return false;
    this.contributions.delete(id);
    this.emit();
    return true;
  }

  list(
    region: WorkspaceLayoutRegion,
    context: WorkspaceLayoutContext,
  ): readonly ResolvedWorkspaceContribution[] {
    return [...this.contributions.values()]
      .filter(({ contribution }) => contribution.region === region)
      .map(({ contribution, placement, sequence }) => ({
        ...contribution,
        order: placement.order ?? contribution.order ?? sequence,
        hidden: placement.hidden ?? false,
        sequence,
      }))
      .filter(
        (contribution) =>
          !contribution.hidden && this.isVisible(contribution, context),
      )
      .sort((a, b) => a.order - b.order || a.sequence - b.sequence)
      .map(({ sequence: _sequence, ...contribution }) => contribution);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getRevision = (): number => this.revision;

  private isVisible(
    contribution: WorkspaceLayoutContribution,
    context: WorkspaceLayoutContext,
  ): boolean {
    const { visibility } = contribution;
    return (
      (!visibility?.breakpoints ||
        visibility.breakpoints.includes(context.breakpoint)) &&
      (!visibility?.roles || visibility.roles.includes(context.role))
    );
  }

  private validateContribution(
    contribution: WorkspaceLayoutContribution,
  ): void {
    if (contribution.contractVersion !== WORKSPACE_LAYOUT_CONTRACT_VERSION) {
      throw new WorkspaceLayoutRegistrationError(
        `Workspace contribution "${contribution.id}" targets contract ${contribution.contractVersion}; this host supports ${WORKSPACE_LAYOUT_CONTRACT_VERSION}.`,
      );
    }
    if (!contribution.id.trim() || !contribution.ownerId.trim()) {
      throw new WorkspaceLayoutRegistrationError(
        "Workspace contributions require non-empty id and ownerId values.",
      );
    }
    if (!workspaceLayoutRegions.includes(contribution.region)) {
      throw new WorkspaceLayoutRegistrationError(
        `Workspace contribution "${contribution.id}" targets an unknown region.`,
      );
    }
    this.validatePlacement(contribution, { order: contribution.order });
  }

  private validatePlacement(
    contribution: WorkspaceLayoutContribution,
    placement: WorkspaceContributionPlacement,
  ): void {
    if (placement.order !== undefined && !Number.isFinite(placement.order)) {
      throw new WorkspaceLayoutRegistrationError(
        `Workspace contribution "${contribution.id}" has a non-finite order.`,
      );
    }
  }

  private emit(): void {
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }
}
