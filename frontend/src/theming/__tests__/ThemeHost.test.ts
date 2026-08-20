import { describe, expect, it } from 'vitest';
import { PRESET_THEMES, type ThemeDefinition } from '@/themes';
import {
  registerActiveThemeContributions,
  extensionThemesToManifests,
  THEME_CONTRACT_VERSION,
  ThemeHost,
  ThemeManifestError,
  type ThemeManifest,
} from '..';

function manifest(overrides: Partial<ThemeDefinition> = {}): ThemeManifest {
  return {
    ...PRESET_THEMES[0],
    id: 'trusted-night',
    contractVersion: THEME_CONTRACT_VERSION,
    ...overrides,
  };
}

describe('ThemeHost', () => {
  it('accepts every existing preset through the runtime manifest contract', () => {
    const host = new ThemeHost();
    for (const preset of PRESET_THEMES) {
      host.register({ ...preset, contractVersion: THEME_CONTRACT_VERSION });
    }
    expect(host.list()).toHaveLength(PRESET_THEMES.length);
  });

  it('registers, swaps, and ownership-safely unregisters validated manifests', () => {
    const host = new ThemeHost();
    const first = manifest();
    const dispose = host.register(first);
    host.swap({ ...first, name: 'Trusted Night Revised' });

    expect(host.get(first.id)?.name).toBe('Trusted Night Revised');
    dispose();
    expect(host.get(first.id)?.name).toBe('Trusted Night Revised');
    expect(host.unregister(first.id)).toBe(true);
  });

  it('rejects incompatible, incomplete, and inaccessible manifests before registration', () => {
    const host = new ThemeHost();
    expect(() => host.register({ ...manifest(), contractVersion: '2.0.0' }))
      .toThrow(ThemeManifestError);
    expect(() => host.register({ ...manifest(), colors: { ...manifest().colors, ink: '200 200 200' } }))
      .toThrow(/contrast/i);
    const incomplete = { ...manifest(), colors: { ...manifest().colors } } as Record<string, unknown>;
    delete (incomplete.colors as Record<string, unknown>).spirit;
    expect(() => host.register(incomplete as unknown as ThemeManifest)).toThrow(/RGB channels/);
  });

  it('loads data-only contributions through an injected transport and cleans them up', async () => {
    const host = new ThemeHost();
    const dispose = await registerActiveThemeContributions(host, {
      loadActiveThemeManifests: async () => [manifest()],
    });
    expect(host.get('trusted-night')).toBeDefined();
    dispose();
    expect(host.get('trusted-night')).toBeUndefined();
  });

  it('accepts only complete server token palettes as extension theme manifests', () => {
    const tokens = Object.fromEntries(Object.entries(manifest().colors).map(([name, value]) => [
      `--color-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      value,
    ]));
    const converted = extensionThemesToManifests([{
      extensionId: 'example.theme',
      theme: { id: 'night', name: 'Night', contractVersion: '1.0', tokens },
    }]);
    expect(converted).toHaveLength(1);
    expect(converted[0]?.id).toBe('example.theme-night');
    expect(extensionThemesToManifests([{
      extensionId: 'example.theme',
      theme: { id: 'partial', name: 'Partial', contractVersion: '1.0', tokens: {} },
    }])).toEqual([]);
  });
});
