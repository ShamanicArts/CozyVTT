import { describe, expect, it } from 'vitest';
import { GameSystem } from '@/types';
import {
  getGameSystemUiDefinition,
  listGameSystemUiDefinitions,
  listSelectableGameSystemUiDefinitions,
} from '../registry';
import {
  GAME_SYSTEM_DESCRIPTIONS,
  GAME_SYSTEM_LABELS,
  GAME_SYSTEM_OPTIONS,
  GAME_SYSTEM_SHORT_LABELS,
} from '@/constants/game-systems';

describe('built-in game-system UI registry', () => {
  const expectedIds = [
    GameSystem.DND_5E,
    GameSystem.PATHFINDER_2E,
    GameSystem.SHADOWRUN_6E,
    GameSystem.CALL_OF_CTHULHU_7E,
  ];

  it('registers every persisted system in compatibility order', () => {
    expect(listGameSystemUiDefinitions().map((definition) => definition.id)).toEqual(expectedIds);
  });

  it('keeps Shadowrun registered but unavailable in creation forms', () => {
    expect(getGameSystemUiDefinition(GameSystem.SHADOWRUN_6E)).toBeDefined();
    expect(listSelectableGameSystemUiDefinitions().map((definition) => definition.id)).toEqual([
      GameSystem.DND_5E,
      GameSystem.PATHFINDER_2E,
      GameSystem.CALL_OF_CTHULHU_7E,
    ]);
    expect(GAME_SYSTEM_OPTIONS.map((option) => option.value)).toEqual([
      GameSystem.DND_5E,
      GameSystem.PATHFINDER_2E,
      GameSystem.CALL_OF_CTHULHU_7E,
    ]);
  });

  it('projects existing metadata and character templates from definitions', () => {
    for (const definition of listGameSystemUiDefinitions()) {
      expect(GAME_SYSTEM_LABELS[definition.id]).toBe(definition.label);
      expect(GAME_SYSTEM_SHORT_LABELS[definition.id]).toBe(definition.shortLabel);
      expect(GAME_SYSTEM_DESCRIPTIONS[definition.id]).toBe(definition.description);
      expect(definition.characterTemplates.map((template) => template.value)).toContain('blank');
    }
  });

  it('does not resolve unknown systems', () => {
    expect(getGameSystemUiDefinition('UNREGISTERED')).toBeUndefined();
  });
});
