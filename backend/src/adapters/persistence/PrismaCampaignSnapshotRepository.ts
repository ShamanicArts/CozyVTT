import type { PrismaClient } from "@prisma/client";
import type { CampaignSnapshotRepository } from "../../ports/CampaignSnapshotRepository";
import { filterMapData, getSpiritVisibility } from "../../utils/spirit-layer";
import { emptyInitiativeState } from "../../domain/initiative/Initiative";

export class PrismaCampaignSnapshotRepository
  implements CampaignSnapshotRepository
{
  constructor(private readonly client: PrismaClient) {}

  async load(input: {
    campaignId: string;
    principalId: string;
    role: "DM" | "PLAYER" | "SPECTATOR";
  }): Promise<Record<string, unknown> | null> {
    const campaign = await this.client.campaign.findUnique({
      where: { id: input.campaignId },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        gameSystem: true,
        currentVibe: true,
        spiritLayerEnabled: true,
        initiativeState: true,
        initiativeRevision: true,
        currentMap: true,
        memberships: {
          select: {
            userId: true,
            role: true,
            characterIds: true,
            user: {
              select: { displayName: true, avatarUrl: true },
            },
          },
        },
      },
    });
    if (!campaign) return null;
    const spiritVisible = await getSpiritVisibility(
      input.campaignId,
      input.principalId,
    );
    const currentMap = campaign.currentMap
      ? filterMapData(
          campaign.currentMap,
          input.role,
          spiritVisible,
          input.principalId,
        )
      : null;
    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        status: campaign.status,
        gameSystem: campaign.gameSystem,
        currentVibe: campaign.currentVibe,
        spiritLayerEnabled: campaign.spiritLayerEnabled,
      },
      principal: { id: input.principalId, role: input.role },
      currentMap,
      spiritVisible,
      initiative:
        campaign.initiativeState &&
        typeof campaign.initiativeState === "object" &&
        !Array.isArray(campaign.initiativeState)
          ? campaign.initiativeState
          : emptyInitiativeState(),
      initiativeRevision: campaign.initiativeRevision,
      roster: campaign.memberships,
    };
  }
}
