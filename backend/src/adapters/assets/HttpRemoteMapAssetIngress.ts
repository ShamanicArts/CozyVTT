import { lookup } from "dns/promises";
import { isIP } from "net";
import path from "path";
import { unlink, writeFile } from "fs/promises";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import type {
  RemoteMapAssetIngress,
  StoredRemoteMapAsset,
} from "../../ports/RemoteMapAssetIngress";
import {
  ensureDirectory,
  generateUniqueFilename,
  getFilePath,
  getFileSizeLimit,
} from "../../utils/fileUtils";

const MAX_REDIRECTS = 4;
const FETCH_TIMEOUT_MS = 30_000;
const ALLOWED_TYPES = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
] as const);

interface DownloadedMapImage {
  bytes: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  originalName: string;
}

type Downloader = (sourceUrl: string) => Promise<DownloadedMapImage>;

/** HTTP ingress with bounded downloads, content sniffing, and local-network denial. */
export class HttpRemoteMapAssetIngress implements RemoteMapAssetIngress {
  constructor(private readonly download: Downloader = downloadRemoteMap) {}

  async store(
    sourceUrl: string,
    campaignId: string,
  ): Promise<StoredRemoteMapAsset> {
    const downloaded = await this.download(sourceUrl);
    const extension = ALLOWED_TYPES.get(downloaded.mimeType);
    if (!extension)
      throw new Error("Remote map must be a PNG, JPEG, or WebP image");

    const originalStem = path.basename(
      downloaded.originalName,
      path.extname(downloaded.originalName),
    );
    const originalName = `${originalStem || "remote-map"}${extension}`;
    const filename = generateUniqueFilename(originalName);
    const directory = getFilePath("MAP", "CAMPAIGN", campaignId);
    const filePath = path.join(directory, filename);
    const thumbnailPath = path.join(directory, `thumb_${filename}`);
    await ensureDirectory(directory);

    try {
      await writeFile(filePath, downloaded.bytes, { flag: "wx" });
      await sharp(downloaded.bytes)
        .resize(300, 300, { fit: "inside", withoutEnlargement: true })
        .toFile(thumbnailPath);
      return {
        filename,
        originalName,
        mimeType: downloaded.mimeType,
        fileSize: downloaded.bytes.length,
        filePath,
        thumbnailPath,
      };
    } catch (error) {
      await this.remove(filePath).catch(() => undefined);
      await this.remove(thumbnailPath).catch(() => undefined);
      throw error;
    }
  }

  async remove(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

async function downloadRemoteMap(
  sourceUrl: string,
): Promise<DownloadedMapImage> {
  let current = parseRemoteUrl(sourceUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertPublicDestination(current);
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: "image/png,image/jpeg,image/webp",
        "User-Agent": "CozyVTT/1.1 remote-map-import",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === MAX_REDIRECTS) {
        throw new Error("Remote map redirected too many times");
      }
      current = parseRemoteUrl(new URL(location, current).href);
      continue;
    }
    if (!response.ok || !response.body) {
      throw new Error(
        `Remote map download failed with HTTP ${response.status}`,
      );
    }
    const announcedSize = Number(response.headers.get("content-length"));
    const limit = getFileSizeLimit("MAP");
    if (Number.isFinite(announcedSize) && announcedSize > limit) {
      throw new Error("Remote map exceeds the configured map size limit");
    }
    const bytes = await readBounded(response.body, limit);
    const detected = await fileTypeFromBuffer(bytes);
    const extension = detected
      ? ALLOWED_TYPES.get(detected.mime as never)
      : null;
    if (!detected || !extension) {
      throw new Error("Remote map content is not a supported image");
    }
    const candidateName = decodeURIComponent(path.basename(current.pathname));
    return {
      bytes,
      mimeType: detected.mime as DownloadedMapImage["mimeType"],
      originalName: candidateName || `remote-map${extension}`,
    };
  }
  throw new Error("Remote map redirected too many times");
}

async function readBounded(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("Remote map exceeds the configured map size limit");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, size);
}

function parseRemoteUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Remote map sourceUrl must be an absolute HTTP URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Remote map sourceUrl must use HTTP or HTTPS");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Remote map sourceUrl must not contain credentials");
  }
  return parsed;
}

async function assertPublicDestination(url: URL): Promise<void> {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Remote map source must be publicly reachable");
  }
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicIp(address))
  ) {
    throw new Error("Remote map source must be publicly reachable");
  }
}

function isPublicIp(address: string): boolean {
  if (address.includes(":")) {
    const normalized = address.toLowerCase();
    if (normalized === "::1" || normalized === "::") return false;
    if (normalized.startsWith("fc") || normalized.startsWith("fd"))
      return false;
    if (/^fe[89ab]/.test(normalized)) return false;
    const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? isPublicIp(mapped) : true;
  }
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
    return false;
  const [a, b] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}
