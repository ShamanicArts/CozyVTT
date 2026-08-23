export interface UvttMapImportRepository {
  createAsset(data: Record<string, unknown>): Promise<{ id: string }>;
  createMap(data: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface PreparedUvttImport {
  asset: Record<string, unknown>;
  map: Record<string, unknown>;
  storedFilePath: string;
  wallCount: number;
  portalCount: number;
  lightCount: number;
  totalSegments: number;
}

export interface UvttImportSource {
  prepare(input: {
    campaignId: string;
    uploadedById: string;
    name: string;
    contents: Buffer;
    gridSize: number;
  }): Promise<PreparedUvttImport>;
  remove(storedFilePath: string): Promise<void>;
}
