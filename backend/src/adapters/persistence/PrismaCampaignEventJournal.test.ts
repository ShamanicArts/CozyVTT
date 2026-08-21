import { PrismaCampaignEventJournal } from "./PrismaCampaignEventJournal";

describe("PrismaCampaignEventJournal", () => {
  it("serializes bigint cursors and records value-bearing domain payloads", async () => {
    const create = jest.fn(async ({ data }) => ({
      sequence: 12n,
      id: "event-12",
      occurredAt: new Date("2026-08-21T12:00:00.000Z"),
      ...data,
      actorId: data.actorId ?? null,
      causationId: data.causationId ?? null,
    }));
    const journal = new PrismaCampaignEventJournal({
      campaignEventRecord: { create },
    } as never);

    await expect(
      journal.append({
        campaignId: "campaign-1",
        type: "initiative.turn.started",
        actorId: "npc-1",
        correlationId: "correlation-1",
        payload: { round: 2 },
      }),
    ).resolves.toMatchObject({
      cursor: "12",
      actorId: "npc-1",
      payload: { round: 2 },
    });
  });

  it("builds role and recipient filtering into the database query", async () => {
    const findMany = jest.fn(async () => []);
    const journal = new PrismaCampaignEventJournal({
      campaignEventRecord: { findMany },
    } as never);
    await journal.read({
      campaignId: "campaign-1",
      principalId: "player-1",
      role: "PLAYER",
      afterCursor: "9",
      limit: 25,
      types: ["actor.moved"],
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          campaignId: "campaign-1",
          sequence: { gt: 9n },
          OR: [
            { visibility: "PUBLIC" },
            {
              visibility: "RECIPIENTS",
              recipientIds: { has: "player-1" },
            },
          ],
        }),
      }),
    );
  });
});
