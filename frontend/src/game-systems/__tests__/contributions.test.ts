import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSystem } from '@/types';
import { activateGameSystemContributions } from '../contributions';
import { getGameSystemUiDefinition } from '../registry';

const activeContribution = {
  extensionId: 'cozyvtt.dnd5e',
  gameSystem: {
    id: GameSystem.DND_5E,
    name: 'Plugin D&D 5e',
    shortName: 'D&D',
    description: 'Plugin-owned D&D sheets.',
    contractVersion: '1' as const,
    selectable: true,
    moduleUrl: '/dnd5e.mjs',
    characterDataSchema: { type: 'object' },
    characterTemplates: [
      {
        id: 'blank',
        name: 'Plugin Blank',
        description: 'A plugin-owned blank sheet.',
        data: {},
      },
    ],
  },
};

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('game-system contribution activation', () => {
  it('overlays a built-in UI definition and restores it on disposal', async () => {
    const builtInName = getGameSystemUiDefinition(GameSystem.DND_5E)?.label;
    const mount = vi.fn(() => ({ update: vi.fn(), dispose: vi.fn() }));
    cleanup = await activateGameSystemContributions([activeContribution], async () => ({
      activateGameSystem: (api: {
        registerCharacterSheet(contribution: { id: string; mount: typeof mount }): () => void;
      }) => api.registerCharacterSheet({ id: GameSystem.DND_5E, mount }),
    }));

    expect(getGameSystemUiDefinition(GameSystem.DND_5E)).toMatchObject({
      ownerId: 'cozyvtt.dnd5e',
      label: 'Plugin D&D 5e',
      characterTemplates: [{ value: 'blank', label: 'Plugin Blank' }],
    });

    cleanup();
    cleanup = undefined;
    expect(getGameSystemUiDefinition(GameSystem.DND_5E)?.label).toBe(builtInName);
  });

  it('contains modules that register a mismatched system ID', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    cleanup = await activateGameSystemContributions([activeContribution], async () => ({
      activateGameSystem: (api: {
        registerCharacterSheet(contribution: { id: string; mount: () => never }): () => void;
      }) => api.registerCharacterSheet({ id: 'OTHER_SYSTEM', mount: () => { throw new Error(); } }),
    }));

    expect(getGameSystemUiDefinition(GameSystem.DND_5E)?.ownerId).toBe('core');
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it('contains modules that do not register their declared sheet', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    cleanup = await activateGameSystemContributions([activeContribution], async () => ({
      activateGameSystem: () => undefined,
    }));

    expect(getGameSystemUiDefinition(GameSystem.DND_5E)?.ownerId).toBe('core');
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
