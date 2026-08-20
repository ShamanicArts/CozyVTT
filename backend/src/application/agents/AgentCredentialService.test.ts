import {
  AgentCredentialError,
  AgentCredentialService,
} from "./AgentCredentialService";
import type { AgentAccessRepository } from "../../ports/AgentAccessRepository";

function repository(member = true): jest.Mocked<AgentAccessRepository> {
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
    markCredentialUsed: jest.fn(),
    campaignMembershipExists: jest.fn().mockResolvedValue(member),
    createConfirmation: jest.fn(),
    approveConfirmation: jest.fn(),
    consumeApprovedConfirmation: jest.fn(),
    listPendingConfirmations: jest.fn(),
    denyConfirmation: jest.fn(),
  };
}

describe("AgentCredentialService", () => {
  it("returns plaintext once while persisting only its hash for a campaign member", async () => {
    const store = repository();
    const service = new AgentCredentialService(
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
    const service = new AgentCredentialService(
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
    ).rejects.toBeInstanceOf(AgentCredentialError);
  });
});
