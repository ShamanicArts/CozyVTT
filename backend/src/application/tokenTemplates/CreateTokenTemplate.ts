import { randomUUID } from 'crypto';
import {
  JsonValue,
  TokenDisposition,
  TokenDisplayMode,
  TokenHp,
  TokenSize,
  TokenTemplate,
  TokenTemplateType,
  tokenTemplateCreated,
} from '../../domain/tokenTemplates/TokenTemplate';
import { DomainEventPublisher } from '../../ports/DomainEventPublisher';
import { TokenTemplateRepository } from '../../ports/TokenTemplateRepository';
import { CreateTokenTemplateSchema } from '../../validators/tokenTemplates';
import { Command, CommandHandler } from '../commands/CommandBus';
import { TokenTemplateMutationError } from './TokenTemplateMutations';

export interface CreateTokenTemplateData {
  name: string;
  imageUrl?: string | null;
  type: TokenTemplateType;
  disposition?: TokenDisposition | null;
  displayMode: TokenDisplayMode;
  size: TokenSize;
  notes?: string | null;
  hp?: TokenHp | null;
  showHpBar: boolean;
  statBlock?: JsonValue | null;
  sightRadius?: number | null;
}

export interface CreateTokenTemplateCommand extends Command<TokenTemplate> {
  readonly type: 'token-template.create';
  readonly campaignId: string;
  readonly createdById: string;
  readonly data: CreateTokenTemplateData;
}

export const CREATE_TOKEN_TEMPLATE = 'token-template.create' as const;

export class CreateTokenTemplate implements CommandHandler<CreateTokenTemplateCommand, TokenTemplate> {
  constructor(
    private readonly repository: TokenTemplateRepository,
    private readonly eventPublisher: DomainEventPublisher
  ) {}

  async execute(command: CreateTokenTemplateCommand): Promise<TokenTemplate> {
    const parsed = CreateTokenTemplateSchema.safeParse(command.data);
    if (!parsed.success) {
      throw new TokenTemplateMutationError(
        400,
        'Validation Error',
        parsed.error.issues.map((issue) => issue.message).join('; '),
      );
    }
    const data = parsed.data;
    const template = await this.repository.create({
      id: randomUUID(),
      campaignId: command.campaignId,
      createdById: command.createdById,
      name: data.name,
      imageUrl: data.imageUrl ?? null,
      type: data.type,
      disposition: data.disposition ?? null,
      displayMode: data.displayMode,
      size: data.size,
      notes: data.notes ?? null,
      hp: data.hp ?? null,
      showHpBar: data.showHpBar,
      statBlock: (data.statBlock as JsonValue | undefined) ?? null,
      sightRadius: data.sightRadius ?? null,
    });

    await this.eventPublisher.publish(tokenTemplateCreated(template));
    return template;
  }
}
