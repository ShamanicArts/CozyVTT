import { Prisma, PrismaClient } from "@prisma/client";
import { CampaignRealtimeRepository } from "../../ports/CampaignRealtimeRepository";

export class PrismaCampaignRealtimeRepository implements CampaignRealtimeRepository {
  constructor(private readonly client: PrismaClient) {}
  findVibe(
    campaignId: string,
  ): Promise<{ vibeSettings: unknown; currentVibe: string | null } | null> {
    return this.client.campaign.findUnique({
      where: { id: campaignId },
      select: { vibeSettings: true, currentVibe: true },
    });
  }
  async updateVibeSettings(
    campaignId: string,
    vibeSettings: unknown,
  ): Promise<void> {
    await this.client.campaign.update({
      where: { id: campaignId },
      data: { vibeSettings: vibeSettings as Prisma.InputJsonValue },
    });
  }
  async updateCurrentVibe(
    campaignId: string,
    currentVibe: string,
  ): Promise<void> {
    await this.client.campaign.update({
      where: { id: campaignId },
      data: { currentVibe },
    });
  }
  async findAudioAsset(
    assetId: string,
  ): Promise<{
    id: string;
    type: string;
    scope: string;
    campaignId: string | null;
  } | null> {
    return this.client.asset.findUnique({
      where: { id: assetId },
      select: { id: true, type: true, scope: true, campaignId: true },
    });
  }
}
