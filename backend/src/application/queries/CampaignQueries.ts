import {
  CampaignQueryRepository,
  CampaignQueryRole,
} from "../../ports/CampaignQueryRepository";
import { Query, QueryContext } from "./QueryHost";

export const CAMPAIGN_SUMMARY = "campaign.summary.get";
export const CAMPAIGN_MAPS = "campaign.maps.list";
export const CAMPAIGN_CURRENT_MAP = "campaign.map.current.get";
export const CAMPAIGN_ROSTER = "campaign.roster.list";
export const CAMPAIGN_CHARACTERS = "campaign.characters.list";
export const CAMPAIGN_INITIATIVE = "campaign.initiative.get";
export const CAMPAIGN_CHAT = "campaign.chat.recent";
export const CAMPAIGN_DICE = "campaign.dice.recent";
export const CAMPAIGN_ASSETS = "campaign.assets.list";
export const CAMPAIGN_TEMPLATES = "campaign.templates.list";
export const CAMPAIGN_CREATURES = "campaign.creatures.list";
type Page = { limit?: number; offset?: number };
const page = (input: Page) => ({
  limit: Math.min(100, Math.max(1, input.limit ?? 50)),
  offset: Math.max(0, input.offset ?? 0),
});
const inputSchema = {
  type: "object",
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 100 },
    offset: { type: "integer", minimum: 0 },
  },
  additionalProperties: false,
};
const meta = (id: string, collection: boolean) => ({
  id,
  version: "1",
  risk: "READ" as const,
  title: id.split(".").join(" "),
  description: `Read the campaign-scoped ${id} view.`,
  requiredPermissions: ["READ" as const],
  operatingRoles: ["DM", "PLAYER", "SPECTATOR"] as const,
  resultRedactionPolicy: "campaign-role-v1",
  bounds: { maxItems: collection ? 100 : 1, maxResultBytes: 262_144 },
  inputSchema,
  outputSchema: collection
    ? { type: "array", items: { type: "object" } }
    : { type: ["object", "null"] },
});
export class CampaignQueryError extends Error {}
export class CampaignQueries {
  constructor(private readonly repository: CampaignQueryRepository) {}
  private async role(context: QueryContext): Promise<CampaignQueryRole> {
    const role =
      context.role ??
      (await this.repository.membership(
        context.principalId,
        context.campaignId,
      ));
    if (!role) throw new CampaignQueryError("Campaign access denied");
    return role;
  }
  query(
    id: string,
    load: (
      campaignId: string,
      role: CampaignQueryRole,
      input: Page,
    ) => Promise<unknown>,
    collection = false,
  ): Query<Page, unknown> {
    return {
      metadata: meta(id, collection),
      execute: async (input, context) =>
        load(context.campaignId, await this.role(context), input),
    };
  }
  all(): Query<Page, unknown>[] {
    return [
      this.query(CAMPAIGN_SUMMARY, (campaignId) =>
        this.repository.summary(campaignId),
      ),
      this.query(
        CAMPAIGN_MAPS,
        (campaignId, _role, input) => {
          const p = page(input);
          return this.repository.maps(campaignId, p.limit, p.offset);
        },
        true,
      ),
      this.query(CAMPAIGN_CURRENT_MAP, (campaignId) =>
        this.repository.currentMap(campaignId),
      ),
      this.query(
        CAMPAIGN_ROSTER,
        (campaignId, _role, input) => {
          const p = page(input);
          return this.repository.roster(campaignId, p.limit, p.offset);
        },
        true,
      ),
      this.query(
        CAMPAIGN_CHARACTERS,
        (campaignId, _role, input) => {
          const p = page(input);
          return this.repository.characters(campaignId, p.limit, p.offset);
        },
        true,
      ),
      this.query(CAMPAIGN_INITIATIVE, (campaignId) =>
        this.repository.initiative(campaignId),
      ),
      this.query(
        CAMPAIGN_CHAT,
        async (campaignId, role, input) => {
          const messages = await this.repository.chat(
            campaignId,
            page(input).limit,
          );
          return role === "DM"
            ? messages
            : messages.filter((message) => message.type !== "DM");
        },
        true,
      ),
      this.query(
        CAMPAIGN_DICE,
        async (campaignId, role, input) => {
          const rolls = await this.repository.dice(
            campaignId,
            page(input).limit,
          );
          return role === "DM"
            ? rolls
            : rolls.filter((roll) => roll.secret !== true);
        },
        true,
      ),
      this.query(
        CAMPAIGN_ASSETS,
        (campaignId, _role, input) => {
          const p = page(input);
          return this.repository.assets(campaignId, p.limit, p.offset);
        },
        true,
      ),
      this.query(
        CAMPAIGN_TEMPLATES,
        (campaignId, _role, input) => {
          const p = page(input);
          return this.repository.templates(campaignId, p.limit, p.offset);
        },
        true,
      ),
      this.query(
        CAMPAIGN_CREATURES,
        (campaignId, _role, input) => {
          const p = page(input);
          return this.repository.creatures(campaignId, p.limit, p.offset);
        },
        true,
      ),
    ];
  }
}
