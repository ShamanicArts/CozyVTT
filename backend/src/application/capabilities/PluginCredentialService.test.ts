import {
  PluginCredentialError,
  PluginCredentialService,
} from "./PluginCredentialService";
import type { PluginAccessRepository } from "../../ports/PluginAccessRepository";

function repository(member = true): jest.Mocked<PluginAccessRepository> {
  return {
    createCredential: jest.fn().mockResolvedValue({
      id: "credential-1",
      delegatedUserId: "user-1",
      campaignId: "campaign-1",
      label: "Scout",
      expiresAt: null,
      revokedAt: null,
    }),
    listCredentials: jest.fn(),
    revokeCredential: jest.fn(),
    findCredentialByHash: jest.fn(),
    findCredentialById: jest.fn(),
    markCredentialUsed: jest.fn(),
    campaignMembershipExists: jest.fn().mockResolvedValue(member),
    activeCredentialDelegates: jest.fn().mockResolvedValue(member),
    createApproval: jest.fn(),
    approveApproval: jest.fn(),
    consumeApprovedApprovalById: jest.fn(),
    listPendingApprovals: jest.fn(),
    denyApproval: jest.fn(),
  };
}

describe("PluginCredentialService", () => {
  it("returns plaintext once while persisting only its hash for a campaign member", async () => {
    const store = repository();
    const service = new PluginCredentialService(
      store,
      () => "sha256:stored-digest",
    );
    const issued = await service.issue({
      userId: "user-1",
      campaignId: "campaign-1",
      label: "Scout",
      expiresAt: null,
    });
    expect(issued.token).toEqual(expect.any(String));
    expect(store.createCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialHash: "sha256:stored-digest",
        delegatedUserId: "user-1",
        campaignId: "campaign-1",
      }),
    );
    expect(JSON.stringify(store.createCredential.mock.calls)).not.toContain(
      issued.token,
    );
  });

  it("refuses issuance outside the delegated user campaign membership", async () => {
    const service = new PluginCredentialService(
      repository(false),
      (value) => value,
    );
    await expect(
      service.issue({
        userId: "user-1",
        campaignId: "campaign-2",
        label: "Scout",
        expiresAt: null,
      }),
    ).rejects.toBeInstanceOf(PluginCredentialError);
  });
});
