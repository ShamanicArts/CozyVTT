import { Prisma, PrismaClient } from '@prisma/client';
import { NewTokenTemplate, TokenTemplate } from '../../domain/tokenTemplates/TokenTemplate';
import { TokenTemplateRepository } from '../../ports/TokenTemplateRepository';

/** Prisma implementation of the token-template persistence port. */
export class PrismaTokenTemplateRepository implements TokenTemplateRepository {
  constructor(private readonly client: PrismaClient) {}

  async create(template: NewTokenTemplate): Promise<TokenTemplate> {
    const saved = await this.client.tokenTemplate.create({
      data: {
        id: template.id,
        name: template.name,
        imageUrl: template.imageUrl,
        type: template.type,
        disposition: template.disposition,
        displayMode: template.displayMode,
        size: template.size as unknown as Prisma.InputJsonValue,
        notes: template.notes,
        hp: toPrismaJson(template.hp),
        showHpBar: template.showHpBar,
        statBlock: toPrismaJson(template.statBlock),
        sightRadius: template.sightRadius,
        createdById: template.createdById,
        campaignId: template.campaignId,
      },
    });

    return {
      ...saved,
      type: saved.type as TokenTemplate['type'],
      disposition: saved.disposition as TokenTemplate['disposition'],
      displayMode: saved.displayMode as TokenTemplate['displayMode'],
      size: saved.size as unknown as TokenTemplate['size'],
      hp: fromPrismaJson(saved.hp) as TokenTemplate['hp'],
      statBlock: fromPrismaJson(saved.statBlock) as TokenTemplate['statBlock'],
    };
  }
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value == null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

function fromPrismaJson(value: Prisma.JsonValue | null): unknown {
  return value === null ? null : value;
}
