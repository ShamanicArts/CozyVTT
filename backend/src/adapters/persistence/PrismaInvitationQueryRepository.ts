import type { PrismaClient } from "@prisma/client";
import type { InvitationQueryRepository } from "../../ports/InvitationQueryRepository";

export class PrismaInvitationQueryRepository
  implements InvitationQueryRepository
{
  constructor(private readonly client: PrismaClient) {}

  async pendingForUser(userId: string) {
    return this.client.campaignInvitation.findMany({
      where: { userId, status: "PENDING" },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            description: true,
            gameSystem: true,
            status: true,
            owner: { select: { displayName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
