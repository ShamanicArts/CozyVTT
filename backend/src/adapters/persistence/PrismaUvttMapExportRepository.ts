import path from "path";
import type { PrismaClient } from "@prisma/client";
import type {
  UvttMapExportRepository,
} from "../../ports/UvttMapExport";

export class PrismaUvttMapExportRepository
  implements UvttMapExportRepository
{
  constructor(private readonly client: PrismaClient) {}

  async source(
    campaignId: string,
    mapId: string,
  ) {
    const map = await this.client.map.findFirst({
      where: { id: mapId, campaignId },
      select: {
        name: true,
        imageUrl: true,
        width: true,
        height: true,
        gridSize: true,
        wallSegments: true,
        lights: true,
      },
    });
    if (!map) return { kind: "missing-map" as const };
    if (!map.imageUrl) return { kind: "missing-image" as const };
    const asset = await this.client.asset.findUnique({
      where: { id: path.basename(map.imageUrl) },
      select: { filePath: true },
    });
    if (!asset) return { kind: "missing-asset" as const };
    return {
      kind: "found" as const,
      source: {
        name: map.name,
        width: map.width,
        height: map.height,
        gridSize: map.gridSize,
        wallSegments: map.wallSegments,
        lights: map.lights,
        imageFilePath: asset.filePath,
      },
    };
  }
}
