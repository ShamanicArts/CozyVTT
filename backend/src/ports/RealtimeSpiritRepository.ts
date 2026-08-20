export interface RealtimeSpiritMap {
  id: string;
  revision: number;
  campaignId: string;
  tokens: unknown;
  annotations?: unknown;
  [key: string]: unknown;
}
export interface RealtimeSpiritRepository {
  setSpiritLayerEnabled(campaignId: string, visible: boolean): Promise<void>;
  findCurrentMapId(campaignId: string): Promise<string | null>;
  findMap(mapId: string): Promise<RealtimeSpiritMap | null>;
  updateMapTokens(mapId: string, expectedRevision: number, tokens: unknown): Promise<number>;
}
