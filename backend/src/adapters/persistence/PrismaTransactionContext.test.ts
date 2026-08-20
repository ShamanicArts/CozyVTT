import { PrismaClient } from "@prisma/client";
import { AcceptCampaignInvitation } from "../../application/campaigns/CampaignCommands";
import { PrismaCampaignAdministrationRepository } from "./PrismaCampaignAdministrationRepository";
import { PrismaTransactionContext } from "./PrismaTransactionContext";

describe("PrismaTransactionContext", () => {
  it("reuses the active transaction for a campaign command with nested $transaction", async () => {
    const transaction = {
      campaignInvitation: { update: jest.fn() },
      campaignMembership: {
        create: jest.fn(async () => ({
          userId: "player",
          campaignId: "campaign",
          role: "PLAYER",
          characterIds: [],
        })),
      },
      character: { updateMany: jest.fn() },
    };
    const root = {
      $transaction: jest.fn(
        async (work: (client: typeof transaction) => unknown) =>
          work(transaction),
      ),
    } as unknown as PrismaClient;
    const context = new PrismaTransactionContext(root);
    const repository = new PrismaCampaignAdministrationRepository(
      context.client,
    );
    const command = new AcceptCampaignInvitation({
      findInvitationWithCampaign: jest.fn(async () => ({
        id: "invitation",
        userId: "player",
        campaignId: "campaign",
        status: "PENDING",
        expiresAt: null,
        campaign: { id: "campaign", gameSystem: null },
      })),
      findCharactersForUser: jest.fn(async () => []),
      acceptInvitation: repository.acceptInvitation.bind(repository),
    } as unknown as ConstructorParameters<typeof AcceptCampaignInvitation>[0]);

    await expect(
      context.execute(() =>
        command.execute({
          type: "campaign.invitation.accept",
          invitationId: "invitation",
          userId: "player",
          characterIds: [],
        }),
      ),
    ).resolves.toMatchObject({ membership: { campaignId: "campaign" } });

    expect(root.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.campaignInvitation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "invitation" } }),
    );
  });

  it("rejects unsupported nested batch transactions instead of escaping the unit of work", async () => {
    const root = {
      $transaction: jest.fn(),
    } as unknown as PrismaClient;
    const context = new PrismaTransactionContext(root);

    await context.execute(async () => {
      await expect(
        (
          context.client.$transaction as unknown as (
            operations: readonly Promise<unknown>[],
          ) => Promise<unknown>
        )([]),
      ).rejects.toThrow("Nested Prisma batch transactions are not supported");
    });
  });
});
