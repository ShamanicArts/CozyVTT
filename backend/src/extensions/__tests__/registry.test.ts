import {
  ExtensionRegistry,
  ExtensionRegistryError,
  parseExtensionManifest,
  satisfiesVersion,
  validateExtensionCompatibility,
  type ExtensionManifest,
  type ExtensionModule,
} from '..';

function manifest(overrides: Partial<ExtensionManifest> = {}): ExtensionManifest {
  return {
    manifestVersion: '1.0',
    id: 'cozyvtt.lantern-capabilities',
    name: 'Lantern Capabilities',
    version: '1.0.0',
    description: 'Adds a campaign note command.',
    compatibility: { extensionApi: '^1.0.0', cozyVtt: '^1.1.0' },
    capabilities: ['commands', 'capability-publications'],
    permissions: ['campaign.read', 'campaign.write'],
    commands: [
      {
        id: 'campaign.add-note',
        version: '1.0.0',
        title: 'Add campaign note',
        description: 'Adds a note to a campaign.',
        inputSchema: { type: 'object', properties: { campaignId: { type: 'string' } } },
        outputSchema: { type: 'object', properties: { noteId: { type: 'string' } } },
        requiredPermissions: ['campaign.write'],
        idempotent: false,
      },
    ],
    publishedCapabilities: [
      {
        id: 'campaign_add_note',
        title: 'Add campaign note',
        description: 'Create a note after user approval.',
        commandId: 'campaign.add-note',
        requiredPermissions: ['campaign.read', 'campaign.write'],
        risk: 'low',
        approval: 'when-risky',
      },
    ],
    ...overrides,
  };
}

function module(overrides: Partial<ExtensionModule> = {}): ExtensionModule {
  return { manifest: manifest(), ...overrides };
}

describe('extension manifest contracts', () => {
  it('accepts a versioned manifest with command-backed capability capabilities', () => {
    expect(parseExtensionManifest(manifest())).toEqual(manifest());
  });

  it('requires declared permissions and prevents capability capabilities bypassing command permissions', () => {
    const invalid = manifest({
      permissions: ['campaign.read'],
      publishedCapabilities: [
        {
          ...manifest().publishedCapabilities[0],
          requiredPermissions: ['campaign.read'],
        },
      ],
    });

    expect(() => parseExtensionManifest(invalid)).toThrow('Permission campaign.write');
    expect(() => parseExtensionManifest(invalid)).toThrow('Published capability must declare command permission campaign.write');
  });

  it('rejects transport-shaped capability descriptors because no transport fields are accepted', () => {
    const invalid = {
      ...manifest(),
      publishedCapabilities: [{ ...manifest().publishedCapabilities[0], route: '/api/campaigns/notes' }],
    };

    expect(() => parseExtensionManifest(invalid)).toThrow('Unrecognized key');
  });

  it('rejects high-risk capabilities that never request approval', () => {
    const invalid = manifest({
      publishedCapabilities: [{ ...manifest().publishedCapabilities[0], risk: 'high', approval: 'never' }],
    });

    expect(() => parseExtensionManifest(invalid)).toThrow('High-risk capability capabilities');
  });
});

describe('extension compatibility', () => {
  it('supports exact, caret, tilde, comparator, and alternative semantic-version ranges', () => {
    expect(satisfiesVersion('1.2.3', '1.2.3')).toBe(true);
    expect(satisfiesVersion('1.4.0', '^1.2.3')).toBe(true);
    expect(satisfiesVersion('2.0.0', '^1.2.3')).toBe(false);
    expect(satisfiesVersion('1.2.9', '~1.2.3')).toBe(true);
    expect(satisfiesVersion('1.3.0', '~1.2.3')).toBe(false);
    expect(satisfiesVersion('1.1.1', '>=1.1.0 <2.0.0')).toBe(true);
    expect(satisfiesVersion('2.0.0', '>=1.1.0 <2.0.0 || ^3.0.0')).toBe(false);
  });

  it('reports each incompatible host dimension', () => {
    const result = validateExtensionCompatibility(manifest(), {
      extensionApiVersion: '2.0.0',
      platformVersion: '2.0.0',
    });

    expect(result.compatible).toBe(false);
    expect(result.reasons).toHaveLength(2);
  });
});

describe('ExtensionRegistry lifecycle', () => {
  it('only exposes command and capability descriptors after successful activation', async () => {
    const calls: string[] = [];
    const registry = new ExtensionRegistry();
    await registry.install(
      module({
        onInstall: () => { calls.push('install'); },
        onActivate: () => { calls.push('activate'); },
        onDeactivate: () => { calls.push('deactivate'); },
        onUninstall: () => { calls.push('uninstall'); },
      })
    );

    expect(registry.getCommand('campaign.add-note')).toBeUndefined();
    expect(registry.listPublishedCapabilities()).toEqual([]);

    await registry.activate('cozyvtt.lantern-capabilities');
    expect(registry.getCommand('campaign.add-note')?.title).toBe('Add campaign note');
    expect(registry.listPublishedCapabilities()).toEqual([
      expect.objectContaining({
        extensionId: 'cozyvtt.lantern-capabilities',
        commandId: 'campaign.add-note',
      }),
    ]);

    await registry.deactivate('cozyvtt.lantern-capabilities');
    expect(registry.getCommand('campaign.add-note')).toBeUndefined();
    await registry.uninstall('cozyvtt.lantern-capabilities');
    expect(calls).toEqual(['install', 'activate', 'deactivate', 'uninstall']);
  });

  it('rejects duplicate extension and declared command ids without invoking the duplicate hook', async () => {
    const registry = new ExtensionRegistry();
    await registry.install(module());

    const duplicateHook = jest.fn();
    await expect(registry.install(module({ onInstall: duplicateHook }))).rejects.toMatchObject({
      code: 'DUPLICATE_EXTENSION',
    });
    expect(duplicateHook).not.toHaveBeenCalled();

    await expect(
      registry.install(
        module({
          manifest: manifest({ id: 'cozyvtt.other-capabilities' }),
        })
      )
    ).rejects.toMatchObject({ code: 'DUPLICATE_COMMAND' });

    await expect(
      registry.install(
        module({
          manifest: manifest({
            id: 'cozyvtt.unique-command-capabilities',
            commands: [{ ...manifest().commands[0], id: 'campaign.list-notes' }],
            publishedCapabilities: [{ ...manifest().publishedCapabilities[0], commandId: 'campaign.list-notes' }],
          }),
        })
      )
    ).rejects.toMatchObject({ code: 'DUPLICATE_PUBLIC_TOOL' });
  });

  it('rolls back failed activation and retains an active extension after failed deactivation', async () => {
    const registry = new ExtensionRegistry();
    await registry.install(module({ onActivate: () => Promise.reject(new Error('boom')) }));

    await expect(registry.activate('cozyvtt.lantern-capabilities')).rejects.toMatchObject({
      code: 'ACTIVATION_FAILED',
    });
    expect(registry.getExtension('cozyvtt.lantern-capabilities')?.state).toBe('installed');
    expect(registry.getCommand('campaign.add-note')).toBeUndefined();

    await registry.uninstall('cozyvtt.lantern-capabilities');
    await registry.install(module({ onDeactivate: () => Promise.reject(new Error('keep active')) }));
    await registry.activate('cozyvtt.lantern-capabilities');

    await expect(registry.deactivate('cozyvtt.lantern-capabilities')).rejects.toMatchObject({
      code: 'DEACTIVATION_FAILED',
    });
    expect(registry.getExtension('cozyvtt.lantern-capabilities')?.state).toBe('active');
    expect(registry.getCommand('campaign.add-note')).toBeDefined();
  });

  it('rejects lifecycle changes while an asynchronous activation is running', async () => {
    let releaseActivation: (() => void) | undefined;
    const activation = new Promise<void>((resolve) => {
      releaseActivation = resolve;
    });
    const registry = new ExtensionRegistry();
    await registry.install(module({ onActivate: () => activation }));

    const firstActivation = registry.activate('cozyvtt.lantern-capabilities');
    await expect(registry.activate('cozyvtt.lantern-capabilities')).rejects.toBeInstanceOf(ExtensionRegistryError);
    releaseActivation?.();
    await firstActivation;
  });
});
