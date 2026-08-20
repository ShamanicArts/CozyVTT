export interface RealtimeSpiritMap {
  id: string;
  campaignId: string;
  tokens: unknown;
  annotations?: unknown;
  [key: string]: unknown;
}
export interface RealtimeSpiritRepository {
  setSpiritLayerEnabled(campaignId: string, visible: boolean): Promise<void>;
  findCurrentMapId(campaignId: string): Promise<string | null>;
  findMap(mapId: string): Promise<RealtimeSpiritMap | null>;
  updateMapTokens(mapId: string, tokens: unknown): Promise<void>;
}
