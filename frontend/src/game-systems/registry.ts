import { lazy, useSyncExternalStore, type ComponentType } from 'react';
import { GameSystem } from '@/types';
import type { CharacterSheetProps } from '@/components/character-sheets/types';

export interface CharacterTemplateOption {
  value: string;
  label: string;
  description: string;
}

export interface GameSystemUiDefinition {
  id: string;
  ownerId: string;
  label: string;
  shortLabel: string;
  description: string;
  selectable: boolean;
  characterTemplates: readonly CharacterTemplateOption[];
  characterSheet: ComponentType<CharacterSheetProps>;
}

const builtInDefinitions: readonly GameSystemUiDefinition[] = [
  {
    id: GameSystem.DND_5E,
    ownerId: 'core',
    label: 'Dungeons & Dragons 5th Edition',
    shortLabel: 'D&D 5e',
    description: 'The world\'s most popular tabletop RPG. High fantasy adventures with heroic characters.',
    selectable: true,
    characterTemplates: [
      { value: 'blank', label: 'Blank Character Sheet', description: 'Start with an empty Level 1 character' },
      { value: 'fighter', label: 'Level 1 Fighter (Example)', description: 'A pre-built Fighter with standard array stats' },
    ],
    characterSheet: lazy(() => import('@/components/character-sheets/dnd5e/DnD5eCharacterSheet')),
  },
  {
    id: GameSystem.PATHFINDER_2E,
    ownerId: 'core',
    label: 'Pathfinder 2nd Edition',
    shortLabel: 'PF2e',
    description: 'A deep and customizable fantasy RPG with tactical combat and character building.',
    selectable: true,
    characterTemplates: [
      { value: 'blank', label: 'Blank Character Sheet', description: 'Start with an empty Level 1 character' },
      { value: 'fighter', label: 'Level 1 Fighter (Example)', description: 'A pre-built Dwarf Fighter' },
    ],
    characterSheet: lazy(() => import('@/components/character-sheets/pathfinder2e/Pathfinder2eCharacterSheet')),
  },
  {
    id: GameSystem.SHADOWRUN_6E,
    ownerId: 'core',
    label: 'Shadowrun 6th Edition',
    shortLabel: 'SR6',
    description: 'Cyberpunk meets fantasy in a dystopian future with magic, technology, and corporate intrigue.',
    selectable: false,
    characterTemplates: [
      { value: 'blank', label: 'Blank Character Sheet', description: 'Start with an empty character' },
      { value: 'streetsamurai', label: 'Street Samurai (Example)', description: 'A combat-focused runner with cyberware' },
    ],
    characterSheet: lazy(() => import('@/components/character-sheets/shadowrun6e/Shadowrun6eCharacterSheet')),
  },
  {
    id: GameSystem.CALL_OF_CTHULHU_7E,
    ownerId: 'core',
    label: 'Call of Cthulhu 7th Edition',
    shortLabel: 'CoC 7e',
    description: 'Investigate cosmic horror in the style of H.P. Lovecraft. Sanity-testing mystery and dread.',
    selectable: true,
    characterTemplates: [
      { value: 'blank', label: 'Blank Investigator Sheet', description: 'Start with an empty investigator' },
      { value: 'privateinvestigator', label: 'Private Investigator (Example)', description: 'A gritty private eye ready for mysteries' },
    ],
    characterSheet: lazy(() => import('@/components/character-sheets/call-of-cthulhu-7e/CallOfCthulhu7eCharacterSheet')),
  },
];

const extensionDefinitions = new Map<string, Map<string, GameSystemUiDefinition>>();
const extensionOwners = new Map<string, string>();
const listeners = new Set<() => void>();
let revision = 0;

function notifyRegistryChanged(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

export function useGameSystemRegistry(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => revision,
    () => revision,
  );
}

export function registerExtensionGameSystemUi(
  extensionId: string,
  definition: Omit<GameSystemUiDefinition, 'ownerId'>,
): () => void {
  const owner = extensionOwners.get(definition.id);
  if (owner && owner !== extensionId) {
    throw new Error(`Game system ${definition.id} is already owned by ${owner}.`);
  }
  const owned = extensionDefinitions.get(extensionId) ?? new Map<string, GameSystemUiDefinition>();
  if (owned.has(definition.id)) {
    throw new Error(`Game system ${definition.id} is already registered by ${extensionId}.`);
  }
  owned.set(definition.id, { ...definition, ownerId: extensionId });
  extensionDefinitions.set(extensionId, owned);
  extensionOwners.set(definition.id, extensionId);
  notifyRegistryChanged();

  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    const registrations = extensionDefinitions.get(extensionId);
    registrations?.delete(definition.id);
    if (extensionOwners.get(definition.id) === extensionId) {
      extensionOwners.delete(definition.id);
    }
    if (registrations?.size === 0) extensionDefinitions.delete(extensionId);
    notifyRegistryChanged();
  };
}

export function listGameSystemUiDefinitions(): readonly GameSystemUiDefinition[] {
  const overlaidIds = new Set(extensionOwners.keys());
  return [
    ...builtInDefinitions.filter((definition) => !overlaidIds.has(definition.id)),
    ...[...extensionDefinitions.values()].flatMap((owned) => [...owned.values()]),
  ];
}

export function listSelectableGameSystemUiDefinitions(): readonly GameSystemUiDefinition[] {
  return listGameSystemUiDefinitions().filter((definition) => definition.selectable);
}

export function getGameSystemUiDefinition(
  gameSystem: string,
): GameSystemUiDefinition | undefined {
  const owner = extensionOwners.get(gameSystem);
  return owner
    ? extensionDefinitions.get(owner)?.get(gameSystem)
    : builtInDefinitions.find((definition) => definition.id === gameSystem);
}
