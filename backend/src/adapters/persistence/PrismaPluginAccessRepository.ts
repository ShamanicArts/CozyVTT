import { timingSafeEqual } from "crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import type {
  ApprovalDisplayMetadata,
  PluginAccessRepository,
  PluginCredentialRecord,
} from "../../ports/PluginAccessRepository";

export class PrismaPluginAccessRepository implements PluginAccessRepository {
  public constructor(private readonly client: PrismaClient) {}
  async createCredential(input: {
    credentialHash: string;
    delegatedUserId: string;
    campaignId: string;
    label: string;
    createdById: string;
    expiresAt: Date | null;
  }): Promise<PluginCredentialRecord> {
    return this.client.delegatedPluginCredential.create({
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
  ): Promise<PluginCredentialRecord[]> {
    return this.client.delegatedPluginCredential.findMany({
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
    const revoked = await this.client.delegatedPluginCredential.updateMany({
      where: { id, delegatedUserId, revokedAt: null },
      data: { revokedAt: now },
    });
    if (revoked.count !== 1) return false;
    await this.client.capabilityApproval.updateMany({
      where: { credentialId: id, state: { in: ["PENDING", "APPROVED"] } },
      data: {
        state: "CANCELLED",
        cancelledAt: now,
        cancellationReason: "CREDENTIAL_REVOKED",
      },
    });
    return true;
  }
  async findCredentialByHash(
    hash: string,
    now: Date,
  ): Promise<PluginCredentialRecord | null> {
    return this.client.delegatedPluginCredential.findFirst({
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
  ): Promise<PluginCredentialRecord | null> {
    return this.client.delegatedPluginCredential.findFirst({
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
    await this.client.delegatedPluginCredential.update({
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
      this.client.delegatedPluginCredential.findFirst({
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
  async createApproval(
    input: Parameters<PluginAccessRepository["createApproval"]>[0],
  ): Promise<{ id: string; expiresAt: Date }> {
    if (Buffer.byteLength(JSON.stringify(input.displayMetadata), "utf8") > 4096)
      throw new Error("Approval display metadata exceeds 4 KiB");
    return this.client.capabilityApproval.create({
      data: {
        ...input,
        displayMetadata: input.displayMetadata as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, expiresAt: true },
    });
  }
  async approveApproval(
    input: Parameters<PluginAccessRepository["approveApproval"]>[0],
  ): Promise<boolean> {
    const result = await this.client.capabilityApproval.updateMany({
      where: {
        id: input.approvalId,
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
    if (result.count === 0)
      await this.client.capabilityApproval.updateMany({
        where: {
          id: input.approvalId,
          delegatedUserId: input.delegatedUserId,
          state: "PENDING",
          expiresAt: { lte: input.now },
        },
        data: { state: "EXPIRED" },
      });
    return result.count === 1;
  }
  async consumeApprovedApprovalById(
    input: Parameters<
      PluginAccessRepository["consumeApprovedApprovalById"]
  >[0],
  ): Promise<boolean> {
    const approval = await this.client.capabilityApproval.findUnique({
      where: { id: input.approvalId },
      select: { inputDigest: true, state: true, expiresAt: true },
    });
    if (!approval || !safeDigestEqual(approval.inputDigest, input.inputDigest))
      return false;
    if (approval.expiresAt <= input.now) {
      if (approval.state === "PENDING" || approval.state === "APPROVED")
        await this.client.capabilityApproval.updateMany({
          where: {
            id: input.approvalId,
            state: { in: ["PENDING", "APPROVED"] },
          },
          data: { state: "EXPIRED" },
        });
      return false;
    }
    const result = await this.client.capabilityApproval.updateMany({
      where: {
        id: input.approvalId,
        credentialId: input.credentialId,
        delegatedUserId: input.delegatedUserId,
        campaignId: input.campaignId,
        extensionId: input.extensionId,
        commandId: input.commandId,
        inputDigest: approval.inputDigest,
        state: "APPROVED",
        expiresAt: { gt: input.now },
      },
      data: { state: "CONSUMED", consumedAt: input.now },
    });
    return result.count === 1;
  }
  async listPendingApprovals(
    delegatedUserId: string,
    now: Date,
  ): Promise<
    Array<{
      id: string;
      campaignId: string;
      extensionId: string;
      commandId: string;
      state: "PENDING";
      displayMetadata: ApprovalDisplayMetadata;
      expiresAt: Date;
      createdAt: Date;
    }>
  > {
    await this.client.capabilityApproval.updateMany({
      where: {
        delegatedUserId,
        state: { in: ["PENDING", "APPROVED"] },
        expiresAt: { lte: now },
      },
      data: { state: "EXPIRED" },
    });
    const approvals = await this.client.capabilityApproval.findMany({
      where: { delegatedUserId, state: "PENDING", expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        campaignId: true,
        extensionId: true,
        commandId: true,
        state: true,
        displayMetadata: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    return approvals.map((approval) => ({
      ...approval,
      state: "PENDING" as const,
      displayMetadata:
        approval.displayMetadata as unknown as ApprovalDisplayMetadata,
    }));
  }
  async denyApproval(input: {
    approvalId: string;
    delegatedUserId: string;
    now: Date;
  }): Promise<boolean> {
    return (
      (
        await this.client.capabilityApproval.updateMany({
          where: {
            id: input.approvalId,
            delegatedUserId: input.delegatedUserId,
            state: "PENDING",
            expiresAt: { gt: input.now },
          },
          data: { state: "REJECTED", rejectedAt: input.now },
        })
      ).count === 1
    );
  }
}

function safeDigestEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
