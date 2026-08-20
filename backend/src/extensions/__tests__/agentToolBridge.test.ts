import { CommandBus, type Command, type CommandHandler } from '../../application/commands/CommandBus';
import { InMemoryExtensionPolicy } from '../../application/policy/ExtensionPolicy';
import type { ExtensionManifest, ExtensionModule } from '../contracts';
import { ExtensionRegistry } from '../registry';
import { AgentToolService } from '../bridge/AgentToolService';
import { AgentToolBridgeError, ExtensionCommandBridge } from '../bridge/ExtensionCommandBridge';
import { InMemoryAgentToolAudit, type CommandBinding } from '../bridge/contracts';

interface AddNoteCommand extends Command<{ noteId: string; apiToken: string }> {
  readonly type: 'campaign.add-note';
  readonly campaignId: string;
  readonly note: string;
}

const campaignId = 'campaign-lantern';
const principal = { id: 'agent-mira', kind: 'agent' as const };

const manifest: ExtensionManifest = {
  manifestVersion: '1.0',
  id: 'cozyvtt.lantern-tools',
  name: 'Lantern tools',
  version: '1.0.0',
  description: 'A fixture extension.',
  compatibility: { extensionApi: '^1.0.0', cozyVtt: '^1.1.0' },
  capabilities: ['commands', 'agent-tools'],
  permissions: ['campaign.read', 'campaign.write'],
  commands: [
    {
      id: 'campaign.add-note',
      version: '1.0.0',
      title: 'Add note',
      description: 'Add a campaign note.',
      inputSchema: {
        type: 'object',
        properties: { note: { type: 'string', minLength: 1 }, campaignId: { type: 'string' } },
        required: ['note'],
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        properties: { noteId: { type: 'string' }, apiToken: { type: 'string' } },
        required: ['noteId', 'apiToken'],
        additionalProperties: false,
      },
      requiredPermissions: ['campaign.write'],
      idempotent: false,
    },
  ],
  agentTools: [
    {
      id: 'campaign_add_note',
      title: 'Add note',
      description: 'Add a campaign note after confirmation.',
      commandId: 'campaign.add-note',
      requiredPermissions: ['campaign.read', 'campaign.write'],
      risk: 'low',
      confirmation: 'when-risky',
    },
  ],
};

describe('AgentToolService and ExtensionCommandBridge', () => {
  async function setup(options: { grant?: boolean; bind?: boolean } = {}) {
    const registry = new ExtensionRegistry();
    const extension: ExtensionModule = { manifest };
    await registry.install(extension);
    await registry.activate(manifest.id);

    const commandBus = new CommandBus();
    const execute = jest.fn(async (command: AddNoteCommand) => ({ noteId: `${command.campaignId}:1`, apiToken: 'never expose this' }));
    const handler: CommandHandler<AddNoteCommand, { noteId: string; apiToken: string }> = { execute };
    commandBus.register('campaign.add-note', handler);

    const policy = new InMemoryExtensionPolicy();
    if (options.grant !== false) {
      policy.grant({
        principalId: principal.id,
        campaignId,
        extensionId: manifest.id,
        permissions: ['campaign.read', 'campaign.write'],
      });
    }

    const audit = new InMemoryAgentToolAudit();
    const binding: CommandBinding = {
      commandId: 'campaign.add-note',
      createCommand: (input, context): AddNoteCommand => ({
        type: 'campaign.add-note',
        campaignId: context.scope.campaignId,
        note: input.note as string,
      }),
    };
    const bridge = new ExtensionCommandBridge(registry, commandBus, policy, audit, options.bind === false ? [] : [binding]);
    return { service: new AgentToolService(bridge), execute, audit };
  }

  it('lists only explicitly granted, allowlisted active tools', async () => {
    const denied = await setup({ grant: false });
    await expect(denied.service.listCatalog({ principal, scope: { campaignId } })).resolves.toEqual([]);

    const allowed = await setup();
    await expect(allowed.service.listCatalog({ principal, scope: { campaignId } })).resolves.toEqual([
      expect.objectContaining({
        id: 'campaign_add_note',
        extensionId: manifest.id,
        confirmationRequired: true,
      }),
    ]);
  });

  it('requires scope-matched permission grants and confirmation before dispatch', async () => {
    const { service, execute, audit } = await setup({ grant: false });
    await expect(
      service.invoke({ principal, scope: { campaignId }, toolId: 'campaign_add_note', input: { note: 'Look for ash.' } })
    ).rejects.toMatchObject<Partial<AgentToolBridgeError>>({ code: 'PERMISSION_DENIED' });
    expect(execute).not.toHaveBeenCalled();
    expect(audit.events.at(-1)).toMatchObject({ outcome: 'denied', reason: 'PERMISSION_DENIED' });

    const granted = await setup();
    await expect(
      granted.service.invoke({ principal, scope: { campaignId }, toolId: 'campaign_add_note', input: { note: 'Look for ash.' } })
    ).rejects.toMatchObject<Partial<AgentToolBridgeError>>({ code: 'CONFIRMATION_REQUIRED' });
    expect(granted.execute).not.toHaveBeenCalled();
  });

  it('validates input, rejects conflicting campaign scope, and never dispatches an unbound descriptor', async () => {
    const { service, execute } = await setup();
    const confirmation = { confirmed: true, approvedByPrincipalId: principal.id };

    await expect(
      service.invoke({ principal, scope: { campaignId }, toolId: 'campaign_add_note', input: {}, confirmation })
    ).rejects.toMatchObject<Partial<AgentToolBridgeError>>({ code: 'INVALID_INPUT' });
    await expect(
      service.invoke({
        principal,
        scope: { campaignId },
        toolId: 'campaign_add_note',
        input: { note: 'Wrong scope', campaignId: 'another-campaign' },
        confirmation,
      })
    ).rejects.toMatchObject<Partial<AgentToolBridgeError>>({ code: 'INVALID_INPUT' });
    expect(execute).not.toHaveBeenCalled();

    const unbound = await setup({ bind: false });
    await expect(
      unbound.service.invoke({ principal, scope: { campaignId }, toolId: 'campaign_add_note', input: { note: 'No route around the bus.' }, confirmation })
    ).rejects.toMatchObject<Partial<AgentToolBridgeError>>({ code: 'UNBOUND_COMMAND' });
    expect(unbound.execute).not.toHaveBeenCalled();
  });

  it('dispatches only through the binding, redacts results, and creates value-free audit evidence', async () => {
    const { service, execute, audit } = await setup();
    const result = await service.invoke({
      principal,
      scope: { campaignId },
      toolId: 'campaign_add_note',
      input: { note: 'Silver ash by the lantern.' },
      confirmation: { confirmed: true, approvedByPrincipalId: principal.id },
    });

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ campaignId, note: 'Silver ash by the lantern.' }));
    expect(result.result).toEqual({
      kind: 'redacted-agent-tool-result',
      data: { noteId: `${campaignId}:1`, apiToken: '[REDACTED]' },
      redactedFields: 1,
    });
    expect(audit.events.at(-1)).toEqual(
      expect.objectContaining({
        outcome: 'succeeded',
        campaignId,
        inputKeys: ['note'],
      })
    );
    expect(JSON.stringify(audit.events)).not.toContain('Silver ash');
  });
});
