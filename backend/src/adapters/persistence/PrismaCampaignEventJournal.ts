import { Prisma, PrismaClient } from "@prisma/client";
import {
  AppendCampaignEvent,
  CampaignEventEnvelope,
  CampaignEventJournal,
  ReadCampaignEvents,
} from "../../ports/CampaignEventJournal";

const MAX_WAIT_MS = 25_000;
const POLL_MS = 200;

export class PrismaCampaignEventJournal implements CampaignEventJournal {
  constructor(
    private readonly client: PrismaClient,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async append(event: AppendCampaignEvent): Promise<CampaignEventEnvelope> {
    const record = await this.client.campaignEventRecord.create({
      data: {
        campaignId: event.campaignId,
        type: event.type,
        version: event.version ?? 1,
        actorId: event.actorId,
        correlationId: event.correlationId,
        causationId: event.causationId,
        visibility: event.visibility ?? "PUBLIC",
        recipientIds: event.recipientIds ?? [],
        payload: event.payload as Prisma.InputJsonValue,
      },
    });
    return envelope(record);
  }

  async read(input: ReadCampaignEvents): Promise<CampaignEventEnvelope[]> {
    const waitMs = Math.min(MAX_WAIT_MS, Math.max(0, input.waitMs ?? 0));
    const deadline = Date.now() + waitMs;
    do {
      const events = await this.readOnce(input);
      if (events.length || Date.now() >= deadline) return events;
      await this.sleep(Math.min(POLL_MS, Math.max(1, deadline - Date.now())));
    } while (Date.now() <= deadline);
    return [];
  }

  private async readOnce(
    input: ReadCampaignEvents,
  ): Promise<CampaignEventEnvelope[]> {
    const after = parseCursor(input.afterCursor);
    const records = await this.client.campaignEventRecord.findMany({
      where: {
        campaignId: input.campaignId,
        sequence: { gt: after },
        ...(input.types?.length ? { type: { in: input.types } } : {}),
        OR: [
          { visibility: "PUBLIC" },
          ...(input.role === "DM" ? [{ visibility: "DM" }] : []),
          { visibility: "RECIPIENTS", recipientIds: { has: input.principalId } },
        ],
      },
      orderBy: { sequence: "asc" },
      take: Math.min(100, Math.max(1, input.limit)),
    });
    return records.map(envelope);
  }
}

function parseCursor(value?: string): bigint {
  if (!value) return 0n;
  if (!/^\d+$/.test(value)) throw new Error("Invalid campaign event cursor");
  return BigInt(value);
}

function envelope(record: {
  sequence: bigint;
  id: string;
  campaignId: string;
  type: string;
  version: number;
  actorId: string | null;
  correlationId: string;
  causationId: string | null;
  occurredAt: Date;
  payload: Prisma.JsonValue;
}): CampaignEventEnvelope {
  return {
    id: record.id,
    cursor: record.sequence.toString(),
    campaignId: record.campaignId,
    type: record.type,
    version: record.version,
    ...(record.actorId ? { actorId: record.actorId } : {}),
    correlationId: record.correlationId,
    ...(record.causationId ? { causationId: record.causationId } : {}),
    occurredAt: record.occurredAt.toISOString(),
    payload: record.payload as Readonly<Record<string, unknown>>,
  };
}
