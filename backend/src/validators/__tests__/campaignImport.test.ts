import {
  CampaignSettingsSchema,
  CreatureTemplateSchema,
  ManifestSchema,
} from '../campaignImport';

const extensionId = `publisher.${'system'.repeat(16)}`;

describe('campaign import game-system IDs', () => {
  it('round-trips namespaced IDs longer than the legacy 50-character limit', () => {
    expect(extensionId.length).toBeGreaterThan(50);
    expect(CampaignSettingsSchema.safeParse({
      name: 'Imported Campaign',
      gameSystem: extensionId,
    }).success).toBe(true);
    expect(CreatureTemplateSchema.safeParse({
      name: 'Imported Creature',
      gameSystem: extensionId,
      statBlock: {
        ac: 10,
        speed: '30 ft.',
        abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      },
    }).success).toBe(true);
  });

  it('applies the same syntax and 128-character bound to archive manifests', () => {
    const manifest = {
      formatVersion: 1,
      exportedAt: new Date(0).toISOString(),
      exportedFrom: 'CozyVTT',
      campaignName: 'Imported Campaign',
      gameSystem: extensionId,
      mapCount: 0,
      tokenCount: 0,
      creatureCount: 0,
      tokenTemplateCount: 0,
      assetCount: 0,
      includesAudio: false,
      totalSizeBytes: 0,
    };
    expect(ManifestSchema.safeParse(manifest).success).toBe(true);
    expect(ManifestSchema.safeParse({ ...manifest, gameSystem: `publisher.${'x'.repeat(120)}` }).success).toBe(false);
    expect(ManifestSchema.safeParse({ ...manifest, gameSystem: 'not valid' }).success).toBe(false);
  });
});
