import type { Prisma, PrismaClient } from "@prisma/client";
import type { CampaignSessionState } from "../../ports/CampaignSessionState";

interface GameState {
  sessionId?: string;
  savedAt: string;
  mapId: string | null;
  tokens: unknown[];
  spiritLayerVisible: boolean;
  currentVibe: string | null;
  annotations: unknown[];
}

export class PrismaCampaignSessionState implements CampaignSessionState {
  constructor(private readonly client: PrismaClient) {}

  async capture(campaignId: string, sessionId: string): Promise<GameState> {
    const campaign = await this.client.campaign.findUnique({
      where: { id: campaignId },
      include: {
        currentMap: {
          select: { id: true, tokens: true, annotations: true },
        },
      },
    });
    if (!campaign) throw new Error("Campaign not found");
    return {
      sessionId,
      savedAt: new Date().toISOString(),
      mapId: campaign.currentMapId,
      tokens: Array.isArray(campaign.currentMap?.tokens)
        ? campaign.currentMap.tokens
        : [],
      spiritLayerVisible: campaign.spiritLayerEnabled,
      currentVibe: campaign.currentVibe,
      annotations: Array.isArray(campaign.currentMap?.annotations)
        ? campaign.currentMap.annotations
        : [],
    };
  }

  async restore(campaignId: string, value: unknown): Promise<void> {
    const state = value as GameState;
    if (!(await this.client.campaign.findUnique({ where: { id: campaignId } })))
      throw new Error("Campaign not found");

    await this.client.campaign.update({
      where: { id: campaignId },
      data: {
        currentMapId: state.mapId,
        spiritLayerEnabled: state.spiritLayerVisible,
        currentVibe: state.currentVibe,
      },
    });
    if (!state.mapId) return;

    const map = await this.client.map.findFirst({
      where: { id: state.mapId, campaignId },
      select: { id: true },
    });
    if (!map) return;
    await this.client.map.update({
      where: { id: state.mapId },
      data: {
        tokens: state.tokens as Prisma.InputJsonValue,
        annotations: state.annotations as Prisma.InputJsonValue,
        revision: { increment: 1 },
      },
    });
  }
}
