import { PrismaClient } from "@prisma/client";
import type {
  AgentAccessRepository,
  AgentCredentialRecord,
} from "../../ports/AgentAccessRepository";

export class PrismaAgentAccessRepository implements AgentAccessRepository {
  public constructor(private readonly client: PrismaClient) {}
  async createCredential(input: {
    credentialHash: string;
    delegatedUserId: string;
    campaignId: string;
    label: string;
    createdById: string;
    expiresAt: Date | null;
  }): Promise<AgentCredentialRecord> {
    return this.client.agentCredential.create({
      data: input,
      select: {
        id: true,
        delegatedUserId: true,
        campaignId: true,
        label: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }
  async listCredentials(
    delegatedUserId: string,
  ): Promise<AgentCredentialRecord[]> {
    return this.client.agentCredential.findMany({
      where: { delegatedUserId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        delegatedUserId: true,
        campaignId: true,
        label: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }
  async revokeCredential(
    id: string,
    delegatedUserId: string,
    now: Date,
  ): Promise<boolean> {
    return (
      (
        await this.client.agentCredential.updateMany({
          where: { id, delegatedUserId, revokedAt: null },
          data: { revokedAt: now },
        })
      ).count === 1
    );
  }
  async findCredentialByHash(
    hash: string,
    now: Date,
  ): Promise<AgentCredentialRecord | null> {
    return this.client.agentCredential.findFirst({
      where: {
        credentialHash: hash,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        delegatedUserId: true,
        campaignId: true,
        label: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }
  async findCredentialById(
    id: string,
    now: Date,
  ): Promise<AgentCredentialRecord | null> {
    return this.client.agentCredential.findFirst({
      where: {
        id,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        delegatedUserId: true,
        campaignId: true,
        label: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }
  async markCredentialUsed(id: string, now: Date): Promise<void> {
    await this.client.agentCredential.update({
      where: { id },
      data: { lastUsedAt: now },
    });
  }
  async campaignMembershipExists(
    userId: string,
    campaignId: string,
  ): Promise<boolean> {
    return Boolean(
      await this.client.campaignMembership.findUnique({
        where: { userId_campaignId: { userId, campaignId } },
        select: { userId: true },
      }),
    );
  }
  async activeCredentialDelegates(input: {
    credentialId: string;
    delegatedUserId: string;
    campaignId: string;
    now: Date;
  }): Promise<boolean> {
    const [credential, membership] = await Promise.all([
      this.client.agentCredential.findFirst({
        where: {
          id: input.credentialId,
          delegatedUserId: input.delegatedUserId,
          campaignId: input.campaignId,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
        },
        select: { id: true },
      }),
      this.client.campaignMembership.findUnique({
        where: {
          userId_campaignId: {
            userId: input.delegatedUserId,
            campaignId: input.campaignId,
          },
        },
        select: { userId: true },
      }),
    ]);
    return Boolean(credential && membership);
  }
  async createConfirmation(
    input: Parameters<AgentAccessRepository["createConfirmation"]>[0],
  ): Promise<{ id: string; expiresAt: Date }> {
    return this.client.agentConfirmation.create({
      data: input,
      select: { id: true, expiresAt: true },
    });
  }
  async approveConfirmation(
    input: Parameters<AgentAccessRepository["approveConfirmation"]>[0],
  ): Promise<boolean> {
    const result = await this.client.agentConfirmation.updateMany({
      where: {
        id: input.confirmationId,
        delegatedUserId: input.delegatedUserId,
        state: "PENDING",
        expiresAt: { gt: input.now },
      },
      data: {
        state: "APPROVED",
        approvedById: input.delegatedUserId,
        approvedAt: input.now,
      },
    });
    return result.count === 1;
  }
  async consumeApprovedConfirmationById(
    input: Parameters<
      AgentAccessRepository["consumeApprovedConfirmationById"]
    >[0],
  ): Promise<boolean> {
    const result = await this.client.agentConfirmation.updateMany({
      where: {
        id: input.confirmationId,
        credentialId: input.credentialId,
        delegatedUserId: input.delegatedUserId,
        campaignId: input.campaignId,
        extensionId: input.extensionId,
        commandId: input.commandId,
        inputDigest: input.inputDigest,
        state: "APPROVED",
        expiresAt: { gt: input.now },
      },
      data: { state: "CONSUMED", consumedAt: input.now },
    });
    return result.count === 1;
  }
  async listPendingConfirmations(
    delegatedUserId: string,
    now: Date,
  ): Promise<
    Array<{
      id: string;
      campaignId: string;
      extensionId: string;
      commandId: string;
      inputDigest: string;
      expiresAt: Date;
      createdAt: Date;
    }>
  > {
    return this.client.agentConfirmation.findMany({
      where: { delegatedUserId, state: "PENDING", expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        campaignId: true,
        extensionId: true,
        commandId: true,
        inputDigest: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }
  async denyConfirmation(input: {
    confirmationId: string;
    delegatedUserId: string;
    now: Date;
  }): Promise<boolean> {
    return (
      (
        await this.client.agentConfirmation.updateMany({
          where: {
            id: input.confirmationId,
            delegatedUserId: input.delegatedUserId,
            state: "PENDING",
            expiresAt: { gt: input.now },
          },
          data: { state: "EXPIRED" },
        })
      ).count === 1
    );
  }
}
