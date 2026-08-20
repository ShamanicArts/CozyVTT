import {
  ExtensionPermission,
  ExtensionPrincipalType,
  PrismaClient,
} from "@prisma/client";
import type {
  ExtensionAdministrationRepository,
  ExtensionGrantRecord,
} from "../../ports/ExtensionAdministrationRepository";

export class PrismaExtensionAdministrationRepository implements ExtensionAdministrationRepository {
  public constructor(private readonly client: PrismaClient) {}

  async listGrants(campaignId?: string): Promise<ExtensionGrantRecord[]> {
    const records = await this.client.extensionGrant.findMany({
      where:
        campaignId === undefined ? undefined : { scopeCampaignId: campaignId },
      orderBy: [
        { extensionId: "asc" },
        { principalId: "asc" },
        { permission: "asc" },
      ],
      select: {
        id: true,
        principalType: true,
        principalId: true,
        scopeCampaignId: true,
        extensionId: true,
        permission: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
    return records.map((record) => ({
      ...record,
      principalType:
        record.principalType as ExtensionGrantRecord["principalType"],
      permission: record.permission as ExtensionGrantRecord["permission"],
    }));
  }

  async grant(
    input: Parameters<ExtensionAdministrationRepository["grant"]>[0],
  ): Promise<ExtensionGrantRecord> {
    const { grantedById, ...grant } = input;
    const record = await this.client.extensionGrant.upsert({
      where: {
        principalType_principalId_scopeCampaignId_extensionId_permission: {
          principalType: grant.principalType as ExtensionPrincipalType,
          principalId: grant.principalId,
          scopeCampaignId: grant.scopeCampaignId,
          extensionId: grant.extensionId,
          permission: grant.permission as ExtensionPermission,
        },
      },
      create: { ...grant, grantedById, revokedAt: null },
      update: { grantedById, expiresAt: grant.expiresAt, revokedAt: null },
    });
    return {
      ...record,
      principalType:
        record.principalType as ExtensionGrantRecord["principalType"],
      permission: record.permission as ExtensionGrantRecord["permission"],
    };
  }

  async revokeGrant(grantId: string, now: Date): Promise<boolean> {
    const result = await this.client.extensionGrant.updateMany({
      where: { id: grantId, revokedAt: null },
      data: { revokedAt: now },
    });
    return result.count === 1;
  }
}
