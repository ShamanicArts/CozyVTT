import fs from "fs/promises";
import { fileTypeFromFile } from "file-type";
import type { UploadedFileInspector } from "../../ports/UploadedFileInspector";

export class NodeUploadedFileInspector implements UploadedFileInspector {
  async exists(filePath: string) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  async mimeType(filePath: string) {
    return (await fileTypeFromFile(filePath))?.mime ?? null;
  }
  async size(filePath: string) {
    return (await fs.stat(filePath)).size;
  }
  async remove(filePath: string) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
