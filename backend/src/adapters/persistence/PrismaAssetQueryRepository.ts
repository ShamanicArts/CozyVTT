import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  AssetQueryInput,
  AssetQueryRecord,
  AssetQueryRepository,
} from "../../ports/AssetQueryRepository";

export class PrismaAssetQueryRepository implements AssetQueryRepository {
  constructor(private readonly client: PrismaClient) {}

  async list(input: AssetQueryInput) {
    if (
      input.campaignId &&
      !input.isAdmin &&
      !(await this.isCampaignMember(input.userId, input.campaignId))
    )
      throw new Error("ASSET_CAMPAIGN_FORBIDDEN");
    const campaignIds = input.isAdmin
      ? []
      : (
          await this.client.campaignMembership.findMany({
            where: { userId: input.userId },
            select: { campaignId: true },
          })
        ).map(({ campaignId }) => campaignId);
    const where: Prisma.AssetWhereInput = {
      ...(input.type ? { type: input.type as never } : {}),
      ...(input.scope ? { scope: input.scope as never } : {}),
      ...(input.search
        ? { name: { contains: input.search, mode: "insensitive" } }
        : {}),
      ...(input.uploadedBy && input.isAdmin
        ? { uploadedById: input.uploadedBy }
        : {}),
      ...(input.campaignId
        ? { campaignId: input.campaignId }
        : input.isAdmin
          ? {}
          : {
              OR: [
                { scope: "GLOBAL" },
                { scope: "USER", uploadedById: input.userId },
                { scope: "CAMPAIGN", campaignId: { in: campaignIds } },
              ],
            }),
    };
    const [assets, total] = await Promise.all([
      this.client.asset.findMany({
        where,
        include: {
          uploadedBy: { select: { id: true, displayName: true } },
          campaign: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      this.client.asset.count({ where }),
    ]);
    return { assets: assets as unknown as AssetQueryRecord[], total };
  }

  async find(id: string, type?: string) {
    return (await this.client.asset.findFirst({
      where: { id, ...(type ? { type: type as never } : {}) },
      include: {
        uploadedBy: { select: { id: true, displayName: true } },
        campaign: { select: { id: true, name: true } },
      },
    })) as unknown as AssetQueryRecord | null;
  }

  async latestAvatar(userId: string) {
    return (await this.client.asset.findFirst({
      where: { type: "AVATAR", uploadedById: userId },
      orderBy: { createdAt: "desc" },
    })) as unknown as AssetQueryRecord | null;
  }

  async isCampaignMember(userId: string, campaignId: string) {
    return Boolean(
      await this.client.campaignMembership.findUnique({
        where: { userId_campaignId: { userId, campaignId } },
        select: { userId: true },
      }),
    );
  }
}
