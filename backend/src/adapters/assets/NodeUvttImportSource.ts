import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type {
  PreparedUvttImport,
  UvttImportSource,
} from "../../ports/UvttMapImportRepository";
import { parseUVTT } from "../../services/uvttParser";
import { ensureDirectory, getFilePath } from "../../utils/fileUtils";

export class NodeUvttImportSource implements UvttImportSource {
  async prepare(input: {
    campaignId: string;
    uploadedById: string;
    name: string;
    contents: Buffer;
    gridSize: number;
  }): Promise<PreparedUvttImport> {
    const parsed = parseUVTT(input.contents, input.gridSize);
    const extension =
      parsed.imageMimeType === "image/webp"
        ? ".webp"
        : parsed.imageMimeType === "image/jpeg"
          ? ".jpg"
          : ".png";
    const filename = `${randomUUID()}${extension}`;
    const uploadPath = getFilePath("MAP", "CAMPAIGN", input.campaignId);
    await ensureDirectory(uploadPath);
    const storedFilePath = path
      .join(uploadPath, filename)
      .replace(/\\/g, "/");
    await fs.writeFile(storedFilePath, parsed.imageBuffer);
    return {
      asset: {
        type: "MAP",
        scope: "CAMPAIGN",
        uploadedById: input.uploadedById,
        campaignId: input.campaignId,
        filename,
        originalName: `${input.name}${extension}`,
        mimeType: parsed.imageMimeType,
        fileSize: parsed.imageBuffer.length,
        filePath: storedFilePath,
        name: input.name,
        tags: ["uvtt-import"],
      },
      map: {
        campaignId: input.campaignId,
        name: input.name,
        width: parsed.mapWidth,
        height: parsed.mapHeight,
        gridSize: input.gridSize,
        tokens: [],
        annotations: [],
        wallSegments: parsed.wallSegments,
        lights: parsed.lightSources,
        lightingEnabled: parsed.wallSegments.length > 0,
      },
      storedFilePath,
      wallCount: parsed.wallCount,
      portalCount: parsed.portalCount,
      lightCount: parsed.lightCount,
      totalSegments: parsed.wallSegments.length,
    };
  }

  async remove(storedFilePath: string): Promise<void> {
    await fs.rm(storedFilePath, { force: true });
  }
}
