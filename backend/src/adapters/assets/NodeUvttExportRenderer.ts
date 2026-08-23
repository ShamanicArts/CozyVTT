import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import type { UvttExportRenderer, UvttExportSource } from "../../ports/UvttMapExport";
import type { LightSource, WallSegment } from "../../types/walls";
import { buildUVTT } from "../../services/uvttExporter";

export class NodeUvttExportRenderer implements UvttExportRenderer {
  async render(source: UvttExportSource): Promise<Buffer> {
    const imageBuffer = await fs.readFile(
      path.resolve(source.imageFilePath.replace(/\\/g, "/")),
    );
    const metadata = await sharp(imageBuffer).metadata();
    return buildUVTT({
      mapWidth: source.width,
      mapHeight: source.height,
      gridSizePx: source.gridSize,
      wallSegments: (Array.isArray(source.wallSegments)
        ? source.wallSegments
        : []) as WallSegment[],
      lights: (Array.isArray(source.lights) ? source.lights : []) as LightSource[],
      imageBuffer,
      imageWidthPx: metadata.width,
    });
  }
}
