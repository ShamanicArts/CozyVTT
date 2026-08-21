import type { PrismaClient } from "@prisma/client";
import type {
  AgentGameplayMembership,
  AgentGameplayRole,
} from "../../ports/AgentGameplay";

export class PrismaAgentGameplayMembership implements AgentGameplayMembership {
  constructor(private readonly client: PrismaClient) {}

  async role(
    userId: string,
    campaignId: string,
  ): Promise<AgentGameplayRole | null> {
    const membership = await this.client.campaignMembership.findUnique({
      where: { userId_campaignId: { userId, campaignId } },
      select: { role: true },
    });
    return membership?.role ?? null;
  }
}
