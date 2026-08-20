import {
  CampaignQueries,
  CAMPAIGN_CHAT,
  CAMPAIGN_DICE,
} from "./CampaignQueries";
import { QueryHost } from "./QueryHost";
import { CampaignQueryRepository } from "../../ports/CampaignQueryRepository";

const repository = (): jest.Mocked<CampaignQueryRepository> => ({
  membership: jest.fn(async (_userId: string, _campaignId: string) => "PLAYER"),
  summary: jest.fn(),
  maps: jest.fn(),
  currentMap: jest.fn(),
  roster: jest.fn(),
  characters: jest.fn(),
  initiative: jest.fn(),
  chat: jest.fn(),
  dice: jest.fn(),
  assets: jest.fn(),
  templates: jest.fn(),
  creatures: jest.fn(),
});
describe("campaign query catalog", () => {
  it("requires campaign membership and publishes bounded READ schemas", async () => {
    const store = repository();
    store.membership.mockResolvedValue(null);
    const host = new QueryHost();
    new CampaignQueries(store).all().forEach((query) => host.register(query));
    expect(host.list()).toHaveLength(11);
    for (const metadata of host.list())
      expect(metadata).toMatchObject({
        risk: "READ",
        inputSchema: { type: "object" },
      });
    await expect(
      host.dispatch(
        CAMPAIGN_CHAT,
        {},
        { principalId: "user", campaignId: "campaign" },
      ),
    ).rejects.toThrow("Campaign access denied");
  });
  it("filters DM chat and secret dice for players and bounds collections", async () => {
    const store = repository();
    store.chat.mockResolvedValue([{ type: "DM" }, { type: "PLAYER" }]);
    store.dice.mockResolvedValue([{ secret: true }, { secret: false }]);
    const host = new QueryHost();
    new CampaignQueries(store).all().forEach((query) => host.register(query));
    await expect(
      host.dispatch(
        CAMPAIGN_CHAT,
        { limit: 999 },
        { principalId: "user", campaignId: "campaign", role: "PLAYER" },
      ),
    ).resolves.toEqual([{ type: "PLAYER" }]);
    await expect(
      host.dispatch(
        CAMPAIGN_DICE,
        {},
        { principalId: "user", campaignId: "campaign", role: "PLAYER" },
      ),
    ).resolves.toEqual([{ secret: false }]);
    expect(store.chat).toHaveBeenCalledWith("campaign", 100);
  });
});
