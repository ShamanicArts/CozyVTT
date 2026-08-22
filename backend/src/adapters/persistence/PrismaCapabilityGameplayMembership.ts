import type { PrismaClient } from "@prisma/client";
import type {
  CapabilityGameplayMembership,
  CapabilityGameplayRole,
} from "../../ports/CapabilityGameplay";

export class PrismaCapabilityGameplayMembership implements CapabilityGameplayMembership {
  constructor(private readonly client: PrismaClient) {}

  async role(
    userId: string,
    campaignId: string,
  ): Promise<CapabilityGameplayRole | null> {
    const membership = await this.client.campaignMembership.findUnique({
      where: { userId_campaignId: { userId, campaignId } },
      select: { role: true },
    });
    return membership?.role ?? null;
  }
}
