import type { PrismaClient } from "@prisma/client";
import { PrismaPluginAccessRepository } from "./PrismaPluginAccessRepository";

function repository() {
  const delegatedPluginCredential = {
    updateMany: jest.fn(async () => ({ count: 1 })),
  };
  const capabilityApproval = {
    findUnique: jest.fn(),
    updateMany: jest.fn(async () => ({ count: 1 })),
    create: jest.fn(async () => ({ id: "approval-1", expiresAt: new Date() })),
  };
  const client = { delegatedPluginCredential, capabilityApproval } as unknown as PrismaClient;
  return {
    access: new PrismaPluginAccessRepository(client),
    delegatedPluginCredential,
    capabilityApproval,
  };
}

const consume = {
  approvalId: "approval-1",
  credentialId: "credential-1",
  delegatedUserId: "user-1",
  campaignId: "campaign-1",
  extensionId: "integration-1",
  commandId: "scene.wall.update",
  inputDigest: "sha256:approved",
  now: new Date("2026-08-22T10:00:00.000Z"),
};

describe("PrismaPluginAccessRepository approvals", () => {
  it("compares the submitted digest before atomically consuming approval", async () => {
    const { access, capabilityApproval } = repository();
    capabilityApproval.findUnique.mockResolvedValue({
      inputDigest: "sha256:different",
      state: "APPROVED",
      expiresAt: new Date("2026-08-22T11:00:00.000Z"),
    });

    await expect(access.consumeApprovedApprovalById(consume)).resolves.toBe(
      false,
    );
    expect(capabilityApproval.updateMany).not.toHaveBeenCalled();

    capabilityApproval.findUnique.mockResolvedValue({
      inputDigest: consume.inputDigest,
      state: "APPROVED",
      expiresAt: new Date("2026-08-22T11:00:00.000Z"),
    });
    await expect(access.consumeApprovedApprovalById(consume)).resolves.toBe(
      true,
    );
    expect(capabilityApproval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          inputDigest: consume.inputDigest,
          state: "APPROVED",
        }),
        data: { state: "CONSUMED", consumedAt: consume.now },
      }),
    );
  });

  it("records rejection separately from expiry", async () => {
    const { access, capabilityApproval } = repository();
    await expect(
      access.denyApproval({
        approvalId: "approval-1",
        delegatedUserId: "user-1",
        now: consume.now,
      }),
    ).resolves.toBe(true);
    expect(capabilityApproval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { state: "REJECTED", rejectedAt: consume.now },
      }),
    );
  });

  it("cancels pending and approved requests when a credential is revoked", async () => {
    const { access, capabilityApproval } = repository();
    await expect(
      access.revokeCredential("credential-1", "user-1", consume.now),
    ).resolves.toBe(true);
    expect(capabilityApproval.updateMany).toHaveBeenCalledWith({
      where: {
        credentialId: "credential-1",
        state: { in: ["PENDING", "APPROVED"] },
      },
      data: {
        state: "CANCELLED",
        cancelledAt: consume.now,
        cancellationReason: "CREDENTIAL_REVOKED",
      },
    });
  });

  it("rejects display metadata larger than 4 KiB", async () => {
    const { access, capabilityApproval } = repository();
    await expect(
      access.createApproval({
        credentialId: "credential-1",
        delegatedUserId: "user-1",
        campaignId: "campaign-1",
        extensionId: "integration-1",
        commandId: "scene.wall.update",
        inputDigest: consume.inputDigest,
        displayMetadata: {
          capabilityTitle: "Wall update",
          capabilityVersion: "1",
          campaignLabel: "Campaign",
          integrationLabel: "Assistant",
          riskExplanation: "x".repeat(4096),
          summary: {},
        },
        expiresAt: new Date("2026-08-22T11:00:00.000Z"),
      }),
    ).rejects.toThrow("exceeds 4 KiB");
    expect(capabilityApproval.create).not.toHaveBeenCalled();
  });
});
