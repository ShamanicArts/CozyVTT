import { Prisma, PrismaClient } from "@prisma/client";
import type {
  McpOAuthAuthorizationRecord,
  McpOAuthClientRecord,
  McpOAuthRepository,
  McpOAuthTokenIdentity,
} from "../../ports/McpOAuthRepository";

export class PrismaMcpOAuthRepository implements McpOAuthRepository {
  public constructor(private readonly client: PrismaClient) {}

  async getClient(clientId: string): Promise<McpOAuthClientRecord | null> {
    const found = await this.client.mcpOAuthClient.findUnique({
      where: { clientId },
    });
    return found
      ? { clientId: found.clientId, metadata: asRecord(found.metadata) }
      : null;
  }

  async saveClient(
    client: McpOAuthClientRecord,
  ): Promise<McpOAuthClientRecord> {
    const saved = await this.client.mcpOAuthClient.upsert({
      where: { clientId: client.clientId },
      create: {
        clientId: client.clientId,
        metadata: client.metadata as Prisma.InputJsonValue,
      },
      update: { metadata: client.metadata as Prisma.InputJsonValue },
    });
    return { clientId: saved.clientId, metadata: asRecord(saved.metadata) };
  }

  async createAuthorization(
    input: Parameters<McpOAuthRepository["createAuthorization"]>[0],
  ): Promise<string> {
    const created = await this.client.mcpOAuthAuthorization.create({
      data: {
        ...input,
        scopes: input.scopes,
      },
      select: { id: true },
    });
    return created.id;
  }

  async getAuthorization(
    id: string,
    now: Date,
  ): Promise<McpOAuthAuthorizationRecord | null> {
    const found = await this.client.mcpOAuthAuthorization.findFirst({
      where: { id, expiresAt: { gt: now }, consumedAt: null },
    });
    return found ? authorizationRecord(found) : null;
  }

  async approveAuthorization(
    input: Parameters<McpOAuthRepository["approveAuthorization"]>[0],
  ): Promise<boolean> {
    const membership = await this.client.campaignMembership.findUnique({
      where: {
        userId_campaignId: {
          userId: input.delegatedUserId,
          campaignId: input.campaignId,
        },
      },
      select: { userId: true },
    });
    if (!membership) return false;
    const updated = await this.client.mcpOAuthAuthorization.updateMany({
      where: {
        id: input.id,
        expiresAt: { gt: input.now },
        approvedAt: null,
        consumedAt: null,
      },
      data: {
        delegatedUserId: input.delegatedUserId,
        campaignId: input.campaignId,
        authorizationCodeHash: input.authorizationCodeHash,
        approvedAt: input.now,
      },
    });
    return updated.count === 1;
  }

  async denyAuthorization(id: string, now: Date): Promise<boolean> {
    const updated = await this.client.mcpOAuthAuthorization.updateMany({
      where: { id, expiresAt: { gt: now }, consumedAt: null },
      data: { consumedAt: now },
    });
    return updated.count === 1;
  }

  async challengeForCode(
    input: Parameters<McpOAuthRepository["challengeForCode"]>[0],
  ): Promise<string | null> {
    const found = await this.client.mcpOAuthAuthorization.findFirst({
      where: {
        authorizationCodeHash: input.authorizationCodeHash,
        clientId: input.clientId,
        approvedAt: { not: null },
        consumedAt: null,
        expiresAt: { gt: input.now },
      },
      select: { codeChallenge: true },
    });
    return found?.codeChallenge ?? null;
  }

  async redeemAuthorization(
    input: Parameters<McpOAuthRepository["redeemAuthorization"]>[0],
  ): Promise<McpOAuthTokenIdentity | null> {
    return this.client.$transaction(async (transaction) => {
      const authorization = await transaction.mcpOAuthAuthorization.findFirst({
        where: {
          authorizationCodeHash: input.authorizationCodeHash,
          clientId: input.clientId,
          approvedAt: { not: null },
          consumedAt: null,
          expiresAt: { gt: input.now },
        },
      });
      if (
        !authorization?.delegatedUserId ||
        !authorization.campaignId ||
        (input.redirectUri !== undefined &&
          input.redirectUri !== authorization.redirectUri) ||
        (input.resource !== undefined &&
          input.resource !== authorization.resource)
      )
        return null;
      const membership = await transaction.campaignMembership.findUnique({
        where: {
          userId_campaignId: {
            userId: authorization.delegatedUserId,
            campaignId: authorization.campaignId,
          },
        },
        select: { userId: true },
      });
      if (!membership) return null;
      const consumed = await transaction.mcpOAuthAuthorization.updateMany({
        where: { id: authorization.id, consumedAt: null },
        data: { consumedAt: input.now },
      });
      if (consumed.count !== 1) return null;
      const credential = await transaction.agentCredential.create({
        data: {
          credentialHash: input.accessCredentialHash,
          delegatedUserId: authorization.delegatedUserId,
          campaignId: authorization.campaignId,
          label: input.label,
          createdById: authorization.delegatedUserId,
          expiresAt: input.accessExpiresAt,
        },
        select: { id: true },
      });
      const scopes = stringArray(authorization.scopes);
      await transaction.mcpOAuthRefreshToken.create({
        data: {
          tokenHash: input.refreshTokenHash,
          clientId: input.clientId,
          credentialId: credential.id,
          delegatedUserId: authorization.delegatedUserId,
          campaignId: authorization.campaignId,
          resource: authorization.resource,
          scopes,
          expiresAt: input.refreshExpiresAt,
        },
      });
      return {
        credentialId: credential.id,
        delegatedUserId: authorization.delegatedUserId,
        campaignId: authorization.campaignId,
        resource: authorization.resource,
        scopes,
      };
    });
  }

  async rotateRefreshToken(
    input: Parameters<McpOAuthRepository["rotateRefreshToken"]>[0],
  ): Promise<McpOAuthTokenIdentity | null> {
    return this.client.$transaction(async (transaction) => {
      const refresh = await transaction.mcpOAuthRefreshToken.findFirst({
        where: {
          tokenHash: input.refreshTokenHash,
          clientId: input.clientId,
          revokedAt: null,
          expiresAt: { gt: input.now },
        },
      });
      if (!refresh || (input.resource && input.resource !== refresh.resource))
        return null;
      const storedScopes = stringArray(refresh.scopes);
      const scopes = input.requestedScopes ?? storedScopes;
      if (scopes.some((scope) => !storedScopes.includes(scope))) return null;
      const membership = await transaction.campaignMembership.findUnique({
        where: {
          userId_campaignId: {
            userId: refresh.delegatedUserId,
            campaignId: refresh.campaignId,
          },
        },
        select: { userId: true },
      });
      if (!membership) return null;
      const revoked = await transaction.mcpOAuthRefreshToken.updateMany({
        where: { id: refresh.id, revokedAt: null },
        data: { revokedAt: input.now },
      });
      if (revoked.count !== 1) return null;
      await transaction.agentCredential.updateMany({
        where: { id: refresh.credentialId, revokedAt: null },
        data: { revokedAt: input.now },
      });
      const credential = await transaction.agentCredential.create({
        data: {
          credentialHash: input.accessCredentialHash,
          delegatedUserId: refresh.delegatedUserId,
          campaignId: refresh.campaignId,
          label: input.label,
          createdById: refresh.delegatedUserId,
          expiresAt: input.accessExpiresAt,
        },
        select: { id: true },
      });
      await transaction.mcpOAuthRefreshToken.create({
        data: {
          tokenHash: input.nextRefreshTokenHash,
          clientId: input.clientId,
          credentialId: credential.id,
          delegatedUserId: refresh.delegatedUserId,
          campaignId: refresh.campaignId,
          resource: refresh.resource,
          scopes,
          expiresAt: input.refreshExpiresAt,
        },
      });
      return {
        credentialId: credential.id,
        delegatedUserId: refresh.delegatedUserId,
        campaignId: refresh.campaignId,
        resource: refresh.resource,
        scopes,
      };
    });
  }

  async revokeToken(tokenHash: string, now: Date): Promise<void> {
    await this.client.$transaction(async (transaction) => {
      await transaction.agentCredential.updateMany({
        where: { credentialHash: tokenHash, revokedAt: null },
        data: { revokedAt: now },
      });
      const refresh = await transaction.mcpOAuthRefreshToken.findUnique({
        where: { tokenHash },
        select: { id: true, credentialId: true },
      });
      if (!refresh) return;
      await transaction.mcpOAuthRefreshToken.updateMany({
        where: { id: refresh.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await transaction.agentCredential.updateMany({
        where: { id: refresh.credentialId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }

  async listCampaignsForUser(
    userId: string,
  ): Promise<Array<{ id: string; name: string; role: string }>> {
    const memberships = await this.client.campaignMembership.findMany({
      where: { userId },
      orderBy: { campaign: { name: "asc" } },
      select: {
        role: true,
        campaign: { select: { id: true, name: true } },
      },
    });
    return memberships.map(({ role, campaign }) => ({
      ...campaign,
      role,
    }));
  }
}

function authorizationRecord(value: {
  id: string;
  clientId: string;
  clientState: string | null;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  scopes: Prisma.JsonValue;
  delegatedUserId: string | null;
  campaignId: string | null;
  expiresAt: Date;
  approvedAt: Date | null;
  consumedAt: Date | null;
}): McpOAuthAuthorizationRecord {
  return { ...value, scopes: stringArray(value.scopes) };
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
