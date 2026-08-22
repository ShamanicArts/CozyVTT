import type { CampaignEventJournal } from "../../ports/CampaignEventJournal";
import type { CampaignQueryRepository } from "../../ports/CampaignQueryRepository";
import type { CampaignSnapshotRepository } from "../../ports/CampaignSnapshotRepository";
import type { Query, QueryContext } from "./QueryHost";

export const CAMPAIGN_SNAPSHOT = "campaign.snapshot.get";
export const CAMPAIGN_EVENTS = "campaign.events.read";

export class PublicCampaignQueries {
  constructor(
    private readonly memberships: CampaignQueryRepository,
    private readonly snapshots: CampaignSnapshotRepository,
    private readonly events: CampaignEventJournal,
  ) {}

  all(): Query[] {
    return [this.snapshot(), this.eventFeed()];
  }

  private snapshot(): Query<Record<string, never>, unknown> {
    return {
      metadata: {
        id: CAMPAIGN_SNAPSHOT,
        version: "1",
        risk: "READ",
        title: "Campaign snapshot",
        description: "Read one authoritative role-filtered campaign snapshot.",
        requiredPermissions: ["READ"],
        operatingRoles: ["DM", "PLAYER", "SPECTATOR"],
        resultRedactionPolicy: "campaign-snapshot-role-v1",
        bounds: { maxItems: 1, maxResultBytes: 524_288 },
        inputSchema: { type: "object", additionalProperties: false },
        outputSchema: { type: ["object", "null"] },
      },
      execute: async (_input, context) => {
        const role = await this.requireRole(context);
        return this.snapshots.load({
          campaignId: context.campaignId,
          principalId: context.principalId,
          role,
        });
      },
    };
  }

  private eventFeed(): Query<
    {
      afterCursor?: string;
      limit?: number;
      types?: string[];
      waitMs?: number;
    },
    unknown
  > {
    return {
      metadata: {
        id: CAMPAIGN_EVENTS,
        version: "1",
        risk: "READ",
        title: "Campaign events",
        description: "Read the bounded role-filtered campaign event feed.",
        requiredPermissions: ["READ"],
        operatingRoles: ["DM", "PLAYER", "SPECTATOR"],
        resultRedactionPolicy: "campaign-events-role-v1",
        bounds: { maxItems: 100, maxResultBytes: 262_144, maxWaitMs: 25000 },
        inputSchema: {
          type: "object",
          properties: {
            afterCursor: { type: "string", pattern: "^[0-9]+$" },
            limit: { type: "integer", minimum: 1, maximum: 100 },
            types: {
              type: "array",
              maxItems: 20,
              items: { type: "string", minLength: 1, maxLength: 120 },
            },
            waitMs: { type: "integer", minimum: 0, maximum: 25000 },
          },
          additionalProperties: false,
        },
        outputSchema: { type: "array", items: { type: "object" } },
      },
      execute: async (input, context) => {
        const role = await this.requireRole(context);
        return this.events.read({
          campaignId: context.campaignId,
          principalId: context.principalId,
          role,
          afterCursor: input.afterCursor,
          limit: Math.min(100, Math.max(1, input.limit ?? 50)),
          types: input.types,
          waitMs: input.waitMs,
        });
      },
    };
  }

  private async requireRole(context: QueryContext) {
    const role =
      context.role ??
      (await this.memberships.membership(
        context.principalId,
        context.campaignId,
      ));
    if (!role) throw new Error("Campaign access denied");
    return role;
  }
}
