import { Prisma, PrismaClient } from '@prisma/client';
import { CharacterRepository, CharacterCreateInput, CharacterUpdateInput } from '../../ports/CharacterRepository';
import { CharacterCampaign, CharacterMembership, CharacterRecord } from '../../domain/characters/Character';

/** Prisma implementation of the character mutation persistence boundary. */
export class PrismaCharacterRepository implements CharacterRepository {
  constructor(private readonly client: PrismaClient) {}

  async findCharacter(id: string): Promise<CharacterRecord | null> {
    const character = await this.client.character.findUnique({ where: { id } });
    return character as CharacterRecord | null;
  }

  async findCampaign(id: string): Promise<CharacterCampaign | null> {
    const campaign = await this.client.campaign.findUnique({
      where: { id },
      select: { id: true, name: true, gameSystem: true },
    });
    return campaign as CharacterCampaign | null;
  }

  async findMembership(userId: string, campaignId: string): Promise<CharacterMembership | null> {
    const membership = await this.client.campaignMembership.findUnique({
      where: { userId_campaignId: { userId, campaignId } },
    });
    return membership as CharacterMembership | null;
  }

  createCharacter(input: CharacterCreateInput): Promise<unknown> {
    return this.client.character.create({
      data: {
        ...input,
        data: input.data as Prisma.InputJsonValue,
        gameSystem: input.gameSystem as never,
      },
    });
  }

  updateCharacterForEdit(id: string, input: CharacterUpdateInput): Promise<unknown> {
    const { name, data, tokenImageUrl } = input;
    return this.client.character.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(data !== undefined ? { data: data as Prisma.InputJsonValue } : {}),
        ...(tokenImageUrl !== undefined ? { tokenImageUrl } : {}),
      },
      include: { campaign: { select: { id: true, name: true } } },
    });
  }

  updateCharacterForAssignment(id: string, campaignId: string | null): Promise<unknown> {
    return this.client.character.update({
      where: { id },
      data: { campaignId },
      include: { campaign: { select: { id: true, name: true, gameSystem: true } } },
    });
  }

  async deleteCharacter(id: string): Promise<void> {
    await this.client.character.delete({ where: { id } });
  }

  async updateMembershipCharacterIds(userId: string, campaignId: string, characterIds: string[]): Promise<void> {
    await this.client.campaignMembership.update({
      where: { userId_campaignId: { userId, campaignId } },
      data: { characterIds },
    });
  }
}
