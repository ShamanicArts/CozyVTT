export interface UvttMapImportRepository {
  createAsset(data: Record<string, unknown>): Promise<{ id: string }>;
  createMap(data: Record<string, unknown>): Promise<Record<string, unknown>>;
}
