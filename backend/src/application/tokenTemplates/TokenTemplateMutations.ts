import { randomUUID } from "crypto";
import type {
  NewTokenTemplate,
  TokenTemplate,
} from "../../domain/tokenTemplates/TokenTemplate";
import type { TokenTemplateRepository } from "../../ports/TokenTemplateRepository";
import type { Command, CommandHandler } from "../commands/CommandBus";

export const UPDATE_TOKEN_TEMPLATE = "token-template.update" as const;
export const DELETE_TOKEN_TEMPLATE = "token-template.delete" as const;
export const SAVE_TOKEN_TEMPLATE = "token-template.save-from-token" as const;
export const COPY_TOKEN_TEMPLATE = "token-template.copy-to" as const;

type TokenTemplateErrorCode = "Validation Error" | "Forbidden" | "Not Found";

export class TokenTemplateMutationError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404,
    public readonly error: TokenTemplateErrorCode,
    message: string,
  ) {
    super(message);
  }
}

interface TokenTemplateCommandBase {
  readonly campaignId: string;
  readonly templateId: string;
}

export interface UpdateTokenTemplateCommand
  extends Command<TokenTemplate>, TokenTemplateCommandBase {
  readonly type: typeof UPDATE_TOKEN_TEMPLATE;
  readonly data: Partial<NewTokenTemplate>;
}

export interface DeleteTokenTemplateCommand
  extends Command<void>, TokenTemplateCommandBase {
  readonly type: typeof DELETE_TOKEN_TEMPLATE;
}

export interface SaveTokenTemplateCommand extends Command<TokenTemplate> {
  readonly type: typeof SAVE_TOKEN_TEMPLATE;
  readonly campaignId: string;
  readonly userId: string;
  readonly data: Omit<NewTokenTemplate, "id" | "campaignId" | "createdById">;
}

export interface CopyTokenTemplateCommand
  extends Command<TokenTemplate>, TokenTemplateCommandBase {
  readonly type: typeof COPY_TOKEN_TEMPLATE;
  readonly userId: string;
  readonly targetCampaignId: string;
}

async function ownedTemplate(
  repository: TokenTemplateRepository,
  campaignId: string,
  templateId: string,
): Promise<TokenTemplate> {
  const template = await repository.find(templateId);
  if (!template) {
    throw new TokenTemplateMutationError(
      404,
      "Not Found",
      "Token template not found",
    );
  }
  if (template.campaignId !== campaignId) {
    throw new TokenTemplateMutationError(
      403,
      "Forbidden",
      "Token template belongs to another campaign",
    );
  }
  return template;
}

export class UpdateTokenTemplate implements CommandHandler<
  UpdateTokenTemplateCommand,
  TokenTemplate
> {
  constructor(private readonly repository: TokenTemplateRepository) {}

  async execute(command: UpdateTokenTemplateCommand): Promise<TokenTemplate> {
    await ownedTemplate(
      this.repository,
      command.campaignId,
      command.templateId,
    );
    return this.repository.update(command.templateId, command.data);
  }
}

export class DeleteTokenTemplate implements CommandHandler<
  DeleteTokenTemplateCommand,
  void
> {
  constructor(private readonly repository: TokenTemplateRepository) {}

  async execute(command: DeleteTokenTemplateCommand): Promise<void> {
    await ownedTemplate(
      this.repository,
      command.campaignId,
      command.templateId,
    );
    await this.repository.delete(command.templateId);
  }
}

export class SaveTokenTemplate implements CommandHandler<
  SaveTokenTemplateCommand,
  TokenTemplate
> {
  constructor(private readonly repository: TokenTemplateRepository) {}

  execute(command: SaveTokenTemplateCommand): Promise<TokenTemplate> {
    return this.repository.create({
      ...command.data,
      id: randomUUID(),
      campaignId: command.campaignId,
      createdById: command.userId,
    });
  }
}

export class CopyTokenTemplate implements CommandHandler<
  CopyTokenTemplateCommand,
  TokenTemplate
> {
  constructor(private readonly repository: TokenTemplateRepository) {}

  async execute(command: CopyTokenTemplateCommand): Promise<TokenTemplate> {
    if (command.campaignId === command.targetCampaignId) {
      throw new TokenTemplateMutationError(
        400,
        "Validation Error",
        "Cannot copy a template to the same campaign. Use duplicate instead.",
      );
    }
    if (
      !(await this.repository.targetCampaignIsDm(
        command.userId,
        command.targetCampaignId,
      ))
    ) {
      throw new TokenTemplateMutationError(
        403,
        "Forbidden",
        "You must be a DM in the target campaign to copy templates there",
      );
    }
    if (!(await this.repository.campaignExists(command.targetCampaignId))) {
      throw new TokenTemplateMutationError(
        404,
        "Not Found",
        "Target campaign not found",
      );
    }

    const source = await ownedTemplate(
      this.repository,
      command.campaignId,
      command.templateId,
    );
    return this.repository.create({
      ...source,
      id: randomUUID(),
      campaignId: command.targetCampaignId,
      createdById: command.userId,
    });
  }
}
