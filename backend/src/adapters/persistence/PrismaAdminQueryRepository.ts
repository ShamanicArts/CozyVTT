import type { PrismaClient } from "@prisma/client";
import type { AdminQueryRepository } from "../../ports/AdminQueryRepository";

export class PrismaAdminQueryRepository implements AdminQueryRepository {
  constructor(private readonly client: PrismaClient) {}

  async stats() {
    const [
      userCount,
      campaignCount,
      activeCampaignCount,
      assetStats,
      activeSessionCount,
      sessionCount,
      characterCount,
      mapCount,
      assetBreakdownRaw,
    ] = await Promise.all([
      this.client.user.count(),
      this.client.campaign.count(),
      this.client.campaign.count({ where: { status: "ACTIVE" } }),
      this.client.asset.aggregate({ _sum: { fileSize: true } }),
      this.client.session.count({ where: { endedAt: null } }),
      this.client.session.count(),
      this.client.character.count(),
      this.client.map.count(),
      this.client.asset.groupBy({
        by: ["type"],
        _count: { id: true },
        _sum: { fileSize: true },
      }),
    ]);
    return {
      userCount,
      campaignCount,
      activeCampaignCount,
      totalStorageBytes: assetStats._sum.fileSize ?? 0,
      activeSessionCount,
      sessionCount,
      characterCount,
      mapCount,
      assetBreakdown: assetBreakdownRaw.map((row) => ({
        type: row.type,
        count: row._count.id,
        sizeBytes: row._sum.fileSize ?? 0,
      })),
    };
  }

  async activity() {
    const rawSessions = await this.client.$queryRaw<
      { userId: string; expire: Date }[]
    >`
      SELECT sess->>'userId' AS "userId", expire
      FROM session
      WHERE expire > NOW() AND sess->>'userId' IS NOT NULL
    `;
    const onlineUserIds = [...new Set(rawSessions.map(({ userId }) => userId))];
    const [recentUsers, recentSessions, onlineUsersData, recentLogs] =
      await Promise.all([
        this.client.user.findMany({
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            email: true,
            displayName: true,
            platformRole: true,
            mfaEnabled: true,
            createdAt: true,
            lastLoginAt: true,
          },
        }),
        this.client.session.findMany({
          orderBy: { startedAt: "desc" },
          take: 20,
          include: { campaign: { select: { id: true, name: true } } },
        }),
        onlineUserIds.length
          ? this.client.user.findMany({
              where: { id: { in: onlineUserIds } },
              select: {
                id: true,
                email: true,
                displayName: true,
                platformRole: true,
                lastLoginAt: true,
              },
            })
          : [],
        this.client.systemLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            level: true,
            message: true,
            userId: true,
            context: true,
            createdAt: true,
          },
        }),
      ]);
    return {
      recentUsers,
      recentSessions,
      onlineUsers: onlineUsersData.map((user) => ({
        ...user,
        sessionExpiry:
          rawSessions.find((session) => session.userId === user.id)?.expire ??
          null,
      })),
      recentLogs,
    };
  }
}
