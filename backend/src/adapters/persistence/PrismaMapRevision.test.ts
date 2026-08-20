import type { PrismaClient } from "@prisma/client";
import { MapRevisionConflictError } from "../../domain/maps/MapRevision";
import { updateMapAtRevision } from "./PrismaMapRevision";

describe("map revision compare-and-swap", () => {
  it("increments only the revision that the application command read", async () => {
    const update = jest.fn(async () => ({ id: "map-1", revision: 8 }));
    const client = { map: { update } } as unknown as PrismaClient;

    const result = await updateMapAtRevision(client, "map-1", 7, {
      tokens: [],
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "map-1", revision: 7 },
      data: { tokens: [], revision: { increment: 1 } },
    });
    expect(result.revision).toBe(8);
  });

  it("turns a stale Prisma write into a stable domain conflict", async () => {
    const client = {
      map: { update: jest.fn(async () => Promise.reject({ code: "P2025" })) },
    } as unknown as PrismaClient;

    await expect(
      updateMapAtRevision(client, "map-1", 7, { tokens: [] }),
    ).rejects.toEqual(new MapRevisionConflictError("map-1", 7));
  });
});
