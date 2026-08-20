import { Prisma, PrismaClient } from "@prisma/client";
import {
  RealtimeSpiritMap,
  RealtimeSpiritRepository,
} from "../../ports/RealtimeSpiritRepository";
export class PrismaRealtimeSpiritRepository implements RealtimeSpiritRepository {
  constructor(private readonly client: PrismaClient) {}
  async setSpiritLayerEnabled(
    campaignId: string,
    visible: boolean,
  ): Promise<void> {
    await this.client.campaign.update({
      where: { id: campaignId },
      data: { spiritLayerEnabled: visible },
    });
  }
  async findCurrentMapId(campaignId: string): Promise<string | null> {
    const campaign = await this.client.campaign.findUnique({
      where: { id: campaignId },
      select: { currentMapId: true },
    });
    return campaign?.currentMapId ?? null;
  }
  async findMap(mapId: string): Promise<RealtimeSpiritMap | null> {
    return this.client.map.findUnique({
      where: { id: mapId },
    }) as unknown as RealtimeSpiritMap | null;
  }
  async updateMapTokens(mapId: string, tokens: unknown): Promise<void> {
    await this.client.map.update({
      where: { id: mapId },
      data: { tokens: tokens as Prisma.InputJsonValue },
    });
  }
}
