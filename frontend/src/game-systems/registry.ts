import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { GameSystem } from '@/types';
import type { CharacterSheetProps } from '@/components/character-sheets/types';

export interface CharacterTemplateOption {
  value: string;
  label: string;
  description: string;
}

export interface GameSystemUiDefinition {
  id: GameSystem;
  label: string;
  shortLabel: string;
  description: string;
  selectable: boolean;
  characterTemplates: readonly CharacterTemplateOption[];
  characterSheet: LazyExoticComponent<ComponentType<CharacterSheetProps>>;
}

const definitions: readonly GameSystemUiDefinition[] = [
  {
    id: GameSystem.DND_5E,
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

export function listGameSystemUiDefinitions(): readonly GameSystemUiDefinition[] {
  return definitions;
}

export function listSelectableGameSystemUiDefinitions(): readonly GameSystemUiDefinition[] {
  return definitions.filter((definition) => definition.selectable);
}

export function getGameSystemUiDefinition(
  gameSystem: string,
): GameSystemUiDefinition | undefined {
  return definitions.find((definition) => definition.id === gameSystem);
}
