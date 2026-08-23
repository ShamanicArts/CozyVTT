import { Prisma, PrismaClient } from '@prisma/client';
import { DiceRollRepository } from '../../ports/DiceRollRepository';

/** Prisma implementation of dice persistence and its audit-chat side effect. */
export class PrismaDiceRollRepository implements DiceRollRepository {
  constructor(private readonly client: PrismaClient) {}

  async findUserDisplayName(userId: string): Promise<string | null> {
    const user = await this.client.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    return user?.displayName ?? null;
  }

  async createDiceRoll(input: Parameters<DiceRollRepository['createDiceRoll']>[0]): Promise<{ id: string }> {
    return this.client.diceRoll.create({
      data: { ...input, breakdown: input.breakdown as unknown as Prisma.InputJsonValue },
      select: { id: true },
    });
  }

  async createDiceRollMessage(input: Parameters<DiceRollRepository['createDiceRollMessage']>[0]) {
    return this.client.message.create({
      data: {
        campaignId: input.campaignId,
        userId: input.userId,
        type: 'DICE_ROLL',
        content: input.content,
        metadata: input.metadata as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, createdAt: true },
    });
  }
}
