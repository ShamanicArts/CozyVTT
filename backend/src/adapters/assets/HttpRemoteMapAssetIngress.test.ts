import { mkdtemp, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import sharp from "sharp";
import { HttpRemoteMapAssetIngress } from "./HttpRemoteMapAssetIngress";

describe("HttpRemoteMapAssetIngress", () => {
  let directory: string;
  const originalUploadDir = process.env.UPLOAD_DIR;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "cozyvtt-map-ingress-"));
    process.env.UPLOAD_DIR = directory;
  });

  afterEach(async () => {
    process.env.UPLOAD_DIR = originalUploadDir;
    await rm(directory, { recursive: true, force: true });
  });

  it("stores inspected image bytes and creates a thumbnail", async () => {
    const bytes = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: "#332211",
      },
    })
      .jpeg()
      .toBuffer();
    const ingress = new HttpRemoteMapAssetIngress(async () => ({
      bytes,
      mimeType: "image/jpeg",
      originalName: "dungeon.jpeg",
    }));
    const stored = await ingress.store(
      "https://example.com/dungeon.jpeg",
      "campaign-1",
    );
    expect(stored.mimeType).toBe("image/jpeg");
    expect(stored.originalName).toBe("dungeon.jpg");
    expect((await readFile(stored.filePath)).length).toBe(bytes.length);
    expect(stored.thumbnailPath).not.toBeNull();
    await expect(readFile(stored.thumbnailPath!)).resolves.toBeDefined();
  });
});
