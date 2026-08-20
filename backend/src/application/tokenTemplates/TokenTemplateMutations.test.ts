import type { TokenTemplate } from "../../domain/tokenTemplates/TokenTemplate";
import type { TokenTemplateRepository } from "../../ports/TokenTemplateRepository";
import {
  CopyTokenTemplate,
  TokenTemplateMutationError,
} from "./TokenTemplateMutations";

const template: TokenTemplate = {
  id: "template-1",
  campaignId: "campaign-a",
  name: "Goblin",
  imageUrl: null,
  type: "npc",
  disposition: "hostile",
  displayMode: "pog",
  size: { width: 1, height: 1 },
  notes: null,
  hp: null,
  showHpBar: false,
  statBlock: null,
  sightRadius: null,
  createdById: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function repository(): jest.Mocked<TokenTemplateRepository> {
  return {
    find: jest.fn(async (_id) => template),
    create: jest.fn(async (input) => ({ ...template, ...input })),
    update: jest.fn(async (_id, data) => ({ ...template, ...data })),
    delete: jest.fn(async (_id) => undefined),
    targetCampaignIsDm: jest.fn(async (_userId, _campaignId) => false),
    campaignExists: jest.fn(async (_campaignId) => true),
  };
}

describe("CopyTokenTemplate", () => {
  it("rejects a copy to the source campaign", async () => {
    await expect(
      new CopyTokenTemplate(repository()).execute({
        type: "token-template.copy-to",
        campaignId: "campaign-a",
        templateId: "template-1",
        userId: "user-1",
        targetCampaignId: "campaign-a",
      }),
    ).rejects.toEqual(
      new TokenTemplateMutationError(
        400,
        "Validation Error",
        "Cannot copy a template to the same campaign. Use duplicate instead.",
      ),
    );
  });

  it("requires DM access to the target campaign", async () => {
    await expect(
      new CopyTokenTemplate(repository()).execute({
        type: "token-template.copy-to",
        campaignId: "campaign-a",
        templateId: "template-1",
        userId: "user-1",
        targetCampaignId: "campaign-b",
      }),
    ).rejects.toEqual(
      new TokenTemplateMutationError(
        403,
        "Forbidden",
        "You must be a DM in the target campaign to copy templates there",
      ),
    );
  });
});
