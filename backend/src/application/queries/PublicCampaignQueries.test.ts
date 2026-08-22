import { PublicCampaignQueries, CAMPAIGN_EVENTS, CAMPAIGN_SNAPSHOT } from "./PublicCampaignQueries";
import { QueryHost } from "./QueryHost";
import type { CampaignQueryRepository } from "../../ports/CampaignQueryRepository";
import type { CampaignSnapshotRepository } from "../../ports/CampaignSnapshotRepository";
import type { CampaignEventJournal } from "../../ports/CampaignEventJournal";

function memberships(role: "DM" | "PLAYER" | "SPECTATOR" | null) {
  return {
    membership: jest.fn(async () => role),
  } as unknown as CampaignQueryRepository;
}

describe("capability-facing campaign queries", () => {
  it("loads an authoritative snapshot under the delegated campaign member", async () => {
    const snapshots: CampaignSnapshotRepository = {
      load: jest.fn(async (input) => ({ map: "visible", input })),
    };
    const events = { read: jest.fn(), append: jest.fn() } as unknown as CampaignEventJournal;
    const host = new QueryHost();
    new PublicCampaignQueries(memberships("PLAYER"), snapshots, events)
      .all()
      .forEach((query) => host.register(query));

    await expect(
      host.dispatch(CAMPAIGN_SNAPSHOT, {}, {
        principalId: "player-1",
        campaignId: "campaign-1",
      }),
    ).resolves.toMatchObject({ map: "visible" });
    expect(snapshots.load).toHaveBeenCalledWith({
      principalId: "player-1",
      campaignId: "campaign-1",
      role: "PLAYER",
    });
  });

  it("passes a bounded resumable cursor to the audience-filtered journal", async () => {
    const journal = {
      append: jest.fn(),
      read: jest.fn(async () => [{ cursor: "42" }]),
    } as unknown as CampaignEventJournal;
    const host = new QueryHost();
    new PublicCampaignQueries(
      memberships("DM"),
      { load: jest.fn() },
      journal,
    )
      .all()
      .forEach((query) => host.register(query));

    await expect(
      host.dispatch(
        CAMPAIGN_EVENTS,
        {
          afterCursor: "41",
          limit: 500,
          types: ["initiative.turn.started"],
          waitMs: 1000,
        },
        { principalId: "dm-1", campaignId: "campaign-1" },
      ),
    ).resolves.toEqual([{ cursor: "42" }]);
    expect(journal.read).toHaveBeenCalledWith({
      campaignId: "campaign-1",
      principalId: "dm-1",
      role: "DM",
      afterCursor: "41",
      limit: 100,
      types: ["initiative.turn.started"],
      waitMs: 1000,
    });
  });

  it("rejects non-members before touching snapshots or events", async () => {
    const snapshots = { load: jest.fn() } as unknown as CampaignSnapshotRepository;
    const journal = { read: jest.fn(), append: jest.fn() } as unknown as CampaignEventJournal;
    const host = new QueryHost();
    new PublicCampaignQueries(memberships(null), snapshots, journal)
      .all()
      .forEach((query) => host.register(query));

    await expect(
      host.dispatch(CAMPAIGN_EVENTS, {}, {
        principalId: "outsider",
        campaignId: "campaign-1",
      }),
    ).rejects.toThrow("Campaign access denied");
    expect(journal.read).not.toHaveBeenCalled();
  });
});
