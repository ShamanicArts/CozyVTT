import {
  CAMPAIGN_PRESENTATION_CONTRACT_VERSION,
  type CampaignPresentationContribution,
  type CampaignPresentationRegistration,
} from "./contracts";

export class PresentationRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PresentationRegistrationError";
  }
}

/** Owns the presentation providers available to one campaign stage. */
export class PresentationRegistry {
  private readonly contributions = new Map<
    string,
    CampaignPresentationContribution
  >();
  private readonly listeners = new Set<() => void>();
  private revision = 0;

  register(
    contribution: CampaignPresentationContribution,
  ): CampaignPresentationRegistration {
    this.validate(contribution);
    if (this.contributions.has(contribution.id)) {
      throw new PresentationRegistrationError(
        `Campaign presentation "${contribution.id}" is already registered.`,
      );
    }

    this.contributions.set(contribution.id, contribution);
    this.emit();

    return {
      dispose: () => {
        if (this.contributions.get(contribution.id) !== contribution) return;
        this.contributions.delete(contribution.id);
        this.emit();
      },
    };
  }

  unregister(id: string, ownerId: string): boolean {
    const contribution = this.contributions.get(id);
    if (!contribution || contribution.ownerId !== ownerId) return false;
    this.contributions.delete(id);
    this.emit();
    return true;
  }

  get(id: string): CampaignPresentationContribution | undefined {
    return this.contributions.get(id);
  }

  list(): readonly CampaignPresentationContribution[] {
    return [...this.contributions.values()];
  }

  resolve(
    activeId: string,
    fallbackId: string,
  ): CampaignPresentationContribution | undefined {
    return this.get(activeId) ?? this.get(fallbackId);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getRevision = (): number => this.revision;

  private validate(contribution: CampaignPresentationContribution): void {
    if (
      contribution.contractVersion !== CAMPAIGN_PRESENTATION_CONTRACT_VERSION
    ) {
      throw new PresentationRegistrationError(
        `Campaign presentation "${contribution.id}" targets contract ${contribution.contractVersion}; this registry supports ${CAMPAIGN_PRESENTATION_CONTRACT_VERSION}.`,
      );
    }
    if (
      !contribution.id.trim() ||
      !contribution.ownerId.trim() ||
      !contribution.title.trim()
    ) {
      throw new PresentationRegistrationError(
        "Campaign presentations require non-empty id, ownerId, and title values.",
      );
    }
  }

  private emit(): void {
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }
}
