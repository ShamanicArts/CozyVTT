import { PrismaCharacterQueryRepository } from "../adapters/persistence/PrismaCharacterQueryRepository";
import { CharacterQueries } from "../application/characters/CharacterQueries";
import { prisma } from "../config/database";

export const productionCharacterQueries = new CharacterQueries(
  new PrismaCharacterQueryRepository(prisma),
);
