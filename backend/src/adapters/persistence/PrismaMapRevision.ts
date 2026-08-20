import { Prisma, PrismaClient } from "@prisma/client";
import { MapRevisionConflictError } from "../../domain/maps/MapRevision";

/** Atomic compare-and-swap for every mutable field stored on a Map row. */
export async function updateMapAtRevision(
  client: PrismaClient,
  mapId: string,
  expectedRevision: number,
  data: Prisma.MapUpdateInput,
) {
  try {
    return await client.map.update({
      where: { id: mapId, revision: expectedRevision },
      data: { ...data, revision: { increment: 1 } },
    });
  } catch (error) {
    if (isMissingRecord(error)) {
      throw new MapRevisionConflictError(mapId, expectedRevision);
    }
    throw error;
  }
}

function isMissingRecord(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2025"
  );
}
