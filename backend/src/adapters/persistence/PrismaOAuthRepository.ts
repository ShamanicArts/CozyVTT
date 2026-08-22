import { Prisma, PrismaClient } from "@prisma/client";
import type {
  OAuthAuthorizationRecord,
  OAuthClientRecord,
  OAuthRepository,
  OAuthTokenIdentity,
} from "../../ports/OAuthRepository";

export class PrismaOAuthRepository implements OAuthRepository {
  public constructor(private readonly client: PrismaClient) {}

  async getClient(clientId: string): Promise<OAuthClientRecord | null> {
    const found = await this.client.oAuthClient.findUnique({
      where: { clientId },
    });
    return found
      ? { clientId: found.clientId, metadata: asRecord(found.metadata) }
      : null;
  }

  async saveClient(
    client: OAuthClientRecord,
  ): Promise<OAuthClientRecord> {
    const saved = await this.client.oAuthClient.upsert({
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
    input: Parameters<OAuthRepository["createAuthorization"]>[0],
  ): Promise<string> {
    const created = await this.client.oAuthAuthorization.create({
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
  ): Promise<OAuthAuthorizationRecord | null> {
    const found = await this.client.oAuthAuthorization.findFirst({
      where: { id, expiresAt: { gt: now }, consumedAt: null },
    });
    return found ? authorizationRecord(found) : null;
  }

  async approveAuthorization(
    input: Parameters<OAuthRepository["approveAuthorization"]>[0],
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
    const updated = await this.client.oAuthAuthorization.updateMany({
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
    const updated = await this.client.oAuthAuthorization.updateMany({
      where: { id, expiresAt: { gt: now }, consumedAt: null },
      data: { consumedAt: now },
    });
    return updated.count === 1;
  }

  async redeemAuthorization(
    input: Parameters<OAuthRepository["redeemAuthorization"]>[0],
  ): Promise<OAuthTokenIdentity | null> {
    return this.client.$transaction(async (transaction) => {
      const authorization = await transaction.oAuthAuthorization.findFirst({
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
        input.codeChallenge !== authorization.codeChallenge ||
        input.redirectUri !== authorization.redirectUri ||
        input.resource !== authorization.resource
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
      const consumed = await transaction.oAuthAuthorization.updateMany({
        where: { id: authorization.id, consumedAt: null },
        data: { consumedAt: input.now },
      });
      if (consumed.count !== 1) return null;
      const credential = await transaction.delegatedPluginCredential.create({
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
      await transaction.oAuthRefreshToken.create({
        data: {
          tokenHash: input.refreshTokenHash,
          clientId: input.clientId,
          credentialId: credential.id,
          delegatedUserId: authorization.delegatedUserId,
          campaignId: authorization.campaignId,
          resource: authorization.resource,
          pluginId: authorization.pluginId,
          resourceId: authorization.resourceId,
          scopes,
          expiresAt: input.refreshExpiresAt,
        },
      });
      return {
        credentialId: credential.id,
        delegatedUserId: authorization.delegatedUserId,
        campaignId: authorization.campaignId,
        resource: authorization.resource,
        pluginId: authorization.pluginId,
        resourceId: authorization.resourceId,
        scopes,
        expiresAt: input.accessExpiresAt,
      };
    });
  }

  async rotateRefreshToken(
    input: Parameters<OAuthRepository["rotateRefreshToken"]>[0],
  ): Promise<OAuthTokenIdentity | null> {
    return this.client.$transaction(async (transaction) => {
      const refresh = await transaction.oAuthRefreshToken.findFirst({
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
      const revoked = await transaction.oAuthRefreshToken.updateMany({
        where: { id: refresh.id, revokedAt: null },
        data: { revokedAt: input.now },
      });
      if (revoked.count !== 1) return null;
      await transaction.delegatedPluginCredential.updateMany({
        where: { id: refresh.credentialId, revokedAt: null },
        data: { revokedAt: input.now },
      });
      const credential = await transaction.delegatedPluginCredential.create({
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
      await transaction.oAuthRefreshToken.create({
        data: {
          tokenHash: input.nextRefreshTokenHash,
          clientId: input.clientId,
          credentialId: credential.id,
          delegatedUserId: refresh.delegatedUserId,
          campaignId: refresh.campaignId,
          resource: refresh.resource,
          pluginId: refresh.pluginId,
          resourceId: refresh.resourceId,
          scopes,
          expiresAt: input.refreshExpiresAt,
        },
      });
      return {
        credentialId: credential.id,
        delegatedUserId: refresh.delegatedUserId,
        campaignId: refresh.campaignId,
        resource: refresh.resource,
        pluginId: refresh.pluginId,
        resourceId: refresh.resourceId,
        scopes,
        expiresAt: input.accessExpiresAt,
      };
    });
  }

  async revokeToken(tokenHash: string, now: Date): Promise<void> {
    await this.client.$transaction(async (transaction) => {
      await transaction.delegatedPluginCredential.updateMany({
        where: { credentialHash: tokenHash, revokedAt: null },
        data: { revokedAt: now },
      });
      const refresh = await transaction.oAuthRefreshToken.findUnique({
        where: { tokenHash },
        select: { id: true, credentialId: true },
      });
      if (!refresh) return;
      await transaction.oAuthRefreshToken.updateMany({
        where: { id: refresh.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await transaction.delegatedPluginCredential.updateMany({
        where: { id: refresh.credentialId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }

  async verifyAccessToken(tokenHash: string, now: Date): Promise<OAuthTokenIdentity | null> {
    const credential = await this.client.delegatedPluginCredential.findFirst({
      where: {
        credentialHash: tokenHash,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
    if (!credential) return null;
    const refresh = await this.client.oAuthRefreshToken.findFirst({
      where: { credentialId: credential.id, revokedAt: null, expiresAt: { gt: now } },
    });
    if (!refresh) return null;
    const membership = await this.client.campaignMembership.findUnique({
      where: { userId_campaignId: { userId: credential.delegatedUserId, campaignId: credential.campaignId } },
      select: { userId: true },
    });
    if (!membership) return null;
    await this.client.delegatedPluginCredential.update({ where: { id: credential.id }, data: { lastUsedAt: now } });
    return {
      credentialId: credential.id,
      delegatedUserId: credential.delegatedUserId,
      campaignId: credential.campaignId,
      resource: refresh.resource,
      pluginId: refresh.pluginId,
      resourceId: refresh.resourceId,
      scopes: stringArray(refresh.scopes),
      expiresAt: credential.expiresAt,
    };
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
  pluginId: string;
  resourceId: string;
}): OAuthAuthorizationRecord {
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
