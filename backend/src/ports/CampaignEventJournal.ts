export type CampaignEventVisibility = "PUBLIC" | "DM" | "RECIPIENTS";

export interface AppendCampaignEvent {
  campaignId: string;
  type: string;
  version?: number;
  actorId?: string;
  correlationId: string;
  causationId?: string;
  visibility?: CampaignEventVisibility;
  recipientIds?: string[];
  payload: Readonly<Record<string, unknown>>;
}

export interface CampaignEventEnvelope {
  id: string;
  cursor: string;
  campaignId: string;
  type: string;
  version: number;
  actorId?: string;
  correlationId: string;
  causationId?: string;
  occurredAt: string;
  payload: Readonly<Record<string, unknown>>;
}

export interface ReadCampaignEvents {
  campaignId: string;
  principalId: string;
  role: "DM" | "PLAYER" | "SPECTATOR";
  afterCursor?: string;
  limit: number;
  types?: string[];
  waitMs?: number;
}

/** Authoritative event history for API consumers; not a task or memory store. */
export interface CampaignEventJournal {
  append(event: AppendCampaignEvent): Promise<CampaignEventEnvelope>;
  read(input: ReadCampaignEvents): Promise<CampaignEventEnvelope[]>;
}

export const NOOP_CAMPAIGN_EVENT_JOURNAL: CampaignEventJournal = {
  append: async (event) => ({
    id: "noop",
    cursor: "0",
    campaignId: event.campaignId,
    type: event.type,
    version: event.version ?? 1,
    actorId: event.actorId,
    correlationId: event.correlationId,
    causationId: event.causationId,
    occurredAt: new Date(0).toISOString(),
    payload: event.payload,
  }),
  read: async () => [],
};
