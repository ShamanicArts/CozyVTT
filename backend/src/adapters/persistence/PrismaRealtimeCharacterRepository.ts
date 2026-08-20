import { Prisma, PrismaClient } from "@prisma/client";
import {
  RealtimeCharacterRecord,
  RealtimeCharacterRepository,
} from "../../ports/RealtimeCharacterRepository";
export class PrismaRealtimeCharacterRepository implements RealtimeCharacterRepository {
  constructor(private readonly client: PrismaClient) {}
  async findCharacter(
    characterId: string,
  ): Promise<RealtimeCharacterRecord | null> {
    return this.client.character.findUnique({
      where: { id: characterId },
    }) as unknown as RealtimeCharacterRecord | null;
  }
  async characterMembership(
    campaignId: string,
    characterId: string,
  ): Promise<boolean> {
    return Boolean(
      await this.client.campaignMembership.findFirst({
        where: { campaignId, characterIds: { has: characterId } },
        select: { id: true },
      }),
    );
  }
  async updateCharacterData(characterId: string, data: unknown): Promise<void> {
    await this.client.character.update({
      where: { id: characterId },
      data: { data: data as Prisma.InputJsonValue },
    });
  }
}
