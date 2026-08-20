import { CreateTokenTemplate, CreateTokenTemplateCommand } from './CreateTokenTemplate';
import { TokenTemplate, NewTokenTemplate } from '../../domain/tokenTemplates/TokenTemplate';
import { DomainEvent, DomainEventPublisher } from '../../ports/DomainEventPublisher';
import { TokenTemplateRepository } from '../../ports/TokenTemplateRepository';

describe('CreateTokenTemplate', () => {
  it('persists a template and publishes a domain event after persistence', async () => {
    const calls: string[] = [];
    const repository: TokenTemplateRepository = {
      create: jest.fn(async (template: NewTokenTemplate): Promise<TokenTemplate> => {
        calls.push('repository');
        return { ...template, createdAt: new Date('2025-01-01T00:00:00.000Z'), updatedAt: new Date('2025-01-01T00:00:00.000Z') };
      }),
    };
    const publisher: DomainEventPublisher = {
      publish: jest.fn(async (event: DomainEvent) => {
        calls.push(`event:${event.type}`);
      }),
    };
    const command: CreateTokenTemplateCommand = {
      type: 'token-template.create',
      campaignId: 'campaign-1',
      createdById: 'user-1',
      data: {
        name: 'Clockwork Owl',
        type: 'npc',
        disposition: 'friendly',
        displayMode: 'pog',
        size: { width: 1, height: 1 },
        hp: { current: 3, max: 3, temp: 0 },
        showHpBar: true,
      },
    };

    const result = await new CreateTokenTemplate(repository, publisher).execute(command);

    expect(result).toMatchObject({
      campaignId: 'campaign-1',
      createdById: 'user-1',
      name: 'Clockwork Owl',
      type: 'npc',
    });
    expect(result.id).toEqual(expect.any(String));
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      disposition: 'friendly',
      imageUrl: null,
      notes: null,
      statBlock: null,
    }));
    expect(calls).toEqual(['repository', 'event:token-template.created']);
    expect(publisher.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'token-template.created',
      template: result,
    }));
  });
});
