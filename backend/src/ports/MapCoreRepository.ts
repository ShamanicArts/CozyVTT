import {
  CurrentMapCampaign,
  MapCoreCreateData,
  MapCoreRecord,
  MapCoreUpdateData,
} from '../domain/maps/MapLifecycle';

/** Persistence boundary for map creation, lifecycle updates, and map selection. */
export interface MapCoreRepository {
  findMap(mapId: string): Promise<MapCoreRecord | null>;
  createMap(data: MapCoreCreateData): Promise<MapCoreRecord>;
  updateMap(mapId: string, data: MapCoreUpdateData): Promise<MapCoreRecord>;
  deleteMap(mapId: string): Promise<void>;
  findCurrentMapId(campaignId: string): Promise<string | null>;
  setCurrentMap(campaignId: string, mapId: string): Promise<CurrentMapCampaign>;
}
