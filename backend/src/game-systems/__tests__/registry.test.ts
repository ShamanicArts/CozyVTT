import { GameSystem } from '..';
import {
  getGameSystemDefinition,
  getSupportedGameSystemIds,
  isSupportedGameSystem,
  listGameSystemDefinitions,
} from '../registry';

describe('built-in game-system registry', () => {
  const expectedIds = [
    GameSystem.DND_5E,
    GameSystem.PATHFINDER_2E,
    GameSystem.SHADOWRUN_6E,
    GameSystem.CALL_OF_CTHULHU_7E,
  ];

  it('registers every persisted system in compatibility order', () => {
    expect(getSupportedGameSystemIds()).toEqual(expectedIds);
    expect(listGameSystemDefinitions().map((definition) => definition.id)).toEqual(expectedIds);
  });

  it('resolves supported IDs without accepting unknown IDs', () => {
    expect(isSupportedGameSystem(GameSystem.DND_5E)).toBe(true);
    expect(getGameSystemDefinition(GameSystem.DND_5E)?.id).toBe(GameSystem.DND_5E);
    expect(isSupportedGameSystem('UNREGISTERED')).toBe(false);
    expect(getGameSystemDefinition('UNREGISTERED')).toBeUndefined();
  });

  it('validates every registered character template through its adapter', () => {
    for (const definition of listGameSystemDefinitions()) {
      const templates = definition.getCharacterTemplates();
      expect(templates.length).toBeGreaterThan(0);
      for (const template of templates) {
        expect(template.gameSystem).toBe(definition.id);
        expect(definition.validateCharacterData(template.data).success).toBe(true);
      }
    }
  });
});
