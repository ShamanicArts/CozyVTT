import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import type { AssetContentStore } from "../../ports/AssetQueryRepository";

export class FileSystemAssetContentStore implements AssetContentStore {
  async read(filePath: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(path.resolve(filePath.replace(/\\/g, "/")));
    } catch {
      return null;
    }
  }

  async createThumbnail(filePath: string, filename: string) {
    try {
      const thumbnailPath = path.join(path.dirname(filePath), `thumb_${filename}`);
      await sharp(filePath)
        .resize(512, 512, { fit: "inside", withoutEnlargement: true })
        .toFile(thumbnailPath);
      return thumbnailPath.replace(/\\/g, "/");
    } catch {
      return null;
    }
  }
}
