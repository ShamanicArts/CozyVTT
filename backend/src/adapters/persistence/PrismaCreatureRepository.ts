import {
  type CreatureTemplate as PrismaCreatureTemplate,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { randomUUID } from "crypto";
import type {
  CreatureSize,
  CreatureStatBlock,
  CreatureTemplate,
  CreatureUpdateData,
  NewCreature,
} from "../../domain/creatures/Creature";
import type { CreatureRepository } from "../../ports/CreatureRepository";
import { seedSrdCreatures } from "../../services/creatureSeed";

function fromPrisma(record: PrismaCreatureTemplate): CreatureTemplate {
  return {
    ...record,
    gameSystem: record.gameSystem,
    statBlock: record.statBlock as unknown as CreatureStatBlock,
    size: record.size as unknown as CreatureSize,
  };
}

function createData(
  data: NewCreature,
): Prisma.CreatureTemplateUncheckedCreateInput {
  return {
    ...data,
    gameSystem: data.gameSystem,
    statBlock: data.statBlock as Prisma.InputJsonValue,
    size: data.size as unknown as Prisma.InputJsonValue,
  };
}

function updateData(
  data: CreatureUpdateData,
): Prisma.CreatureTemplateUncheckedUpdateInput {
  const { gameSystem, statBlock, size, ...scalars } = data;
  return {
    ...scalars,
    ...(gameSystem !== undefined && {
      gameSystem,
    }),
    ...(statBlock !== undefined && {
      statBlock: statBlock as Prisma.InputJsonValue,
    }),
    ...(size !== undefined && {
      size: size as unknown as Prisma.InputJsonValue,
    }),
  };
}

export class PrismaCreatureRepository implements CreatureRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(id: string): Promise<CreatureTemplate | null> {
    const creature = await this.prisma.creatureTemplate.findUnique({
      where: { id },
    });
    return creature ? fromPrisma(creature) : null;
  }

  async create(data: NewCreature): Promise<CreatureTemplate> {
    return fromPrisma(
      await this.prisma.creatureTemplate.create({
        data: { id: randomUUID(), ...createData(data) },
      }),
    );
  }

  async update(
    id: string,
    data: CreatureUpdateData,
  ): Promise<CreatureTemplate> {
    return fromPrisma(
      await this.prisma.creatureTemplate.update({
        where: { id },
        data: updateData(data),
      }),
    );
  }

  async delete(id: string): Promise<void> {
    await this.prisma.creatureTemplate.delete({ where: { id } });
  }

  async favorite(
    campaignId: string,
    userId: string,
    creatureId: string,
  ): Promise<boolean> {
    const existing = await this.prisma.creatureFavorite.findUnique({
      where: {
        campaignId_userId_creatureId: { campaignId, userId, creatureId },
      },
    });
    if (existing) {
      await this.prisma.creatureFavorite.delete({ where: { id: existing.id } });
      return false;
    }

    await this.prisma.creatureFavorite.create({
      data: { id: randomUUID(), campaignId, userId, creatureId },
    });
    return true;
  }

  seed() {
    return seedSrdCreatures(this.prisma);
  }
}
