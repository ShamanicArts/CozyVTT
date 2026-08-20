import { Prisma, PrismaClient } from "@prisma/client";
import {
  NewTokenTemplate,
  TokenTemplate,
} from "../../domain/tokenTemplates/TokenTemplate";
import { TokenTemplateRepository } from "../../ports/TokenTemplateRepository";

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

    return map(saved);
  }
  async find(id: string): Promise<TokenTemplate | null> {
    const value = await this.client.tokenTemplate.findUnique({ where: { id } });
    return value ? map(value) : null;
  }
  async update(
    id: string,
    data: Partial<NewTokenTemplate>,
  ): Promise<TokenTemplate> {
    const value = await this.client.tokenTemplate.update({
      where: { id },
      data: {
        ...data,
        size: data.size as any,
        hp: data.hp === undefined ? undefined : toPrismaJson(data.hp),
        statBlock:
          data.statBlock === undefined
            ? undefined
            : toPrismaJson(data.statBlock),
      },
    });
    return map(value);
  }
  async delete(id: string): Promise<void> {
    await this.client.tokenTemplate.delete({ where: { id } });
  }
  async targetCampaignIsDm(
    userId: string,
    campaignId: string,
  ): Promise<boolean> {
    const m = await this.client.campaignMembership.findUnique({
      where: { userId_campaignId: { userId, campaignId } },
    });
    return m?.role === "DM";
  }
  async campaignExists(campaignId: string): Promise<boolean> {
    return !!(await this.client.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    }));
  }
}
function map(saved: any): TokenTemplate {
  return {
    ...saved,
    type: saved.type as TokenTemplate["type"],
    disposition: saved.disposition as TokenTemplate["disposition"],
    displayMode: saved.displayMode as TokenTemplate["displayMode"],
    size: saved.size as TokenTemplate["size"],
    hp: fromPrismaJson(saved.hp) as TokenTemplate["hp"],
    statBlock: fromPrismaJson(saved.statBlock) as TokenTemplate["statBlock"],
  };
}

function toPrismaJson(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value == null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

function fromPrismaJson(value: Prisma.JsonValue | null): unknown {
  return value === null ? null : value;
}
