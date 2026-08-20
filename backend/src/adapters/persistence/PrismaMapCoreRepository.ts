import { Prisma, PrismaClient } from '@prisma/client';
import {
  CurrentMapCampaign,
  MapCoreCreateData,
  MapCoreRecord,
  MapCoreUpdateData,
} from '../../domain/maps/MapLifecycle';
import { MapCoreRepository } from '../../ports/MapCoreRepository';
import { updateMapAtRevision } from './PrismaMapRevision';

/** Prisma implementation for core map lifecycle persistence. */
export class PrismaMapCoreRepository implements MapCoreRepository {
  constructor(private readonly client: PrismaClient) {}

  async findMap(mapId: string): Promise<MapCoreRecord | null> {
    const map = await this.client.map.findUnique({ where: { id: mapId } });
    return map as MapCoreRecord | null;
  }

  async createMap(data: MapCoreCreateData): Promise<MapCoreRecord> {
    const map = await this.client.map.create({
      data: {
        ...data,
        tokens: data.tokens as unknown as Prisma.InputJsonValue,
        annotations: data.annotations as unknown as Prisma.InputJsonValue,
      },
    });
    return map as MapCoreRecord;
  }

  async updateMap(mapId: string, expectedRevision: number, data: MapCoreUpdateData): Promise<MapCoreRecord> {
    const map = await updateMapAtRevision(this.client, mapId, expectedRevision, data);
    return map as MapCoreRecord;
  }

  async deleteMap(mapId: string): Promise<void> {
    await this.client.map.delete({ where: { id: mapId } });
  }

  async findCurrentMapId(campaignId: string): Promise<string | null> {
    const campaign = await this.client.campaign.findUnique({
      where: { id: campaignId },
      select: { currentMapId: true },
    });
    return campaign?.currentMapId ?? null;
  }

  async setCurrentMap(campaignId: string, mapId: string): Promise<CurrentMapCampaign> {
    const campaign = await this.client.campaign.update({
      where: { id: campaignId },
      data: { currentMapId: mapId },
      include: { currentMap: { select: { id: true, name: true, imageUrl: true } } },
    });
    return campaign as unknown as CurrentMapCampaign;
  }
}
