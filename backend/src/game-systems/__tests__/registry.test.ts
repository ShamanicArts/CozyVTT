import { GameSystem } from '..';
import {
  getGameSystemDefinition,
  getSupportedGameSystemIds,
  isSupportedGameSystem,
  listGameSystemDefinitions,
  registerExtensionGameSystems,
  unregisterExtensionGameSystems,
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

  it('overlays a built-in system while its owning extension is active', () => {
    registerExtensionGameSystems('cozyvtt.dnd5e', [
      {
        id: GameSystem.DND_5E,
        characterDataSchema: {
          type: 'object',
          required: ['heroName'],
          properties: { heroName: { type: 'string', minLength: 1 } },
          additionalProperties: false,
        },
        characterTemplates: [
          {
            id: 'blank',
            name: 'Plugin Blank Character',
            description: 'A plugin-owned compatibility template.',
            data: { heroName: 'New Hero' },
          },
        ],
      },
    ]);

    try {
      const definition = getGameSystemDefinition(GameSystem.DND_5E);
      expect(definition?.getCharacterTemplate().name).toBe('Plugin Blank Character');
      expect(definition?.validateCharacterData({ heroName: 'Aria' }).success).toBe(true);
      expect(definition?.validateCharacterData({ characterName: 'Legacy' }).success).toBe(false);
    } finally {
      unregisterExtensionGameSystems('cozyvtt.dnd5e');
    }

    expect(getGameSystemDefinition(GameSystem.DND_5E)?.getCharacterTemplate().name).not.toBe(
      'Plugin Blank Character',
    );
  });

  it('rejects competing extension owners for the same system', () => {
    const contribution = {
      id: 'publisher.system',
      characterDataSchema: { type: 'object' },
      characterTemplates: [
        { id: 'blank', name: 'Blank', description: 'Blank character.', data: {} },
      ],
    };
    registerExtensionGameSystems('publisher.one', [contribution]);
    try {
      expect(() => registerExtensionGameSystems('publisher.two', [contribution])).toThrow(
        'already owned by publisher.one',
      );
    } finally {
      unregisterExtensionGameSystems('publisher.one');
      unregisterExtensionGameSystems('publisher.two');
    }
  });

  it('rejects extension templates that do not satisfy their declared schema', () => {
    expect(() => registerExtensionGameSystems('publisher.invalid', [
      {
        id: 'publisher.invalid',
        characterDataSchema: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string' } },
        },
        characterTemplates: [
          { id: 'blank', name: 'Blank', description: 'Invalid blank.', data: {} },
        ],
      },
    ])).toThrow('does not match its schema');
    expect(getGameSystemDefinition('publisher.invalid')).toBeUndefined();
  });

  it('does not leak earlier registrations when a later schema fails to compile', () => {
    expect(() => registerExtensionGameSystems('publisher.atomic', [
      {
        id: 'publisher.valid',
        characterDataSchema: { type: 'object' },
        characterTemplates: [
          { id: 'blank', name: 'Blank', description: 'Valid blank.', data: {} },
        ],
      },
      {
        id: 'publisher.invalid-schema',
        characterDataSchema: { type: 'not-a-json-schema-type' },
        characterTemplates: [
          { id: 'blank', name: 'Blank', description: 'Invalid blank.', data: {} },
        ],
      },
    ])).toThrow();

    expect(getGameSystemDefinition('publisher.valid')).toBeUndefined();
    expect(getGameSystemDefinition('publisher.invalid-schema')).toBeUndefined();
  });

  it('supports standard JSON Schema union types used by generated schemas', () => {
    registerExtensionGameSystems('publisher.union', [
      {
        id: 'publisher.union',
        characterDataSchema: {
          type: 'object',
          required: ['age'],
          properties: { age: { type: ['string', 'number'] } },
        },
        characterTemplates: [
          { id: 'blank', name: 'Blank', description: 'Union template.', data: { age: 20 } },
        ],
      },
    ]);
    try {
      expect(getGameSystemDefinition('publisher.union')?.validateCharacterData({ age: '20' }).success).toBe(true);
      expect(getGameSystemDefinition('publisher.union')?.validateCharacterData({ age: false }).success).toBe(false);
    } finally {
      unregisterExtensionGameSystems('publisher.union');
    }
  });
});
