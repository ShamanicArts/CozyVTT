/**
 * Delivery-neutral boundary for turning a remote image into locally persisted
 * map bytes. The application layer owns authorization and metadata; adapters
 * own network, MIME, size, and filesystem concerns.
 */
export interface StoredRemoteMapAsset {
  filename: string;
  originalName: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  fileSize: number;
  filePath: string;
  thumbnailPath: string | null;
}

export interface RemoteMapAssetIngress {
  store(sourceUrl: string, campaignId: string): Promise<StoredRemoteMapAsset>;
  remove(filePath: string): Promise<void>;
}
