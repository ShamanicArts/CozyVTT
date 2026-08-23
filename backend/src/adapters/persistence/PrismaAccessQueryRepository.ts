import type { PrismaClient } from "@prisma/client";
import type { AccessQueryRepository } from "../../ports/AccessQueryRepository";

export class PrismaAccessQueryRepository implements AccessQueryRepository {
  constructor(private readonly client: PrismaClient) {}
  campaignMembership(userId: string, campaignId: string) {
    return this.client.campaignMembership.findUnique({
      where: { userId_campaignId: { userId, campaignId } },
      select: { role: true, characterIds: true, campaignId: true },
    });
  }
  async mustChangePassword(userId: string) {
    return (
      await this.client.user.findUnique({
        where: { id: userId },
        select: { mustChangePassword: true },
      })
    )?.mustChangePassword ?? null;
  }
}
