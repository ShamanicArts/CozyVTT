/**
 * Game Systems Constants
 * Display labels, descriptions, and form options for game systems
 */

import {
  getGameSystemUiDefinition,
  listGameSystemUiDefinitions,
  listSelectableGameSystemUiDefinitions,
} from '../game-systems/registry';

/**
 * Display labels for each game system
 */
export const GAME_SYSTEM_LABELS = Object.fromEntries(
  listGameSystemUiDefinitions().map((definition) => [definition.id, definition.label]),
) as Record<string, string>;

/**
 * Short display labels for each game system
 */
export const GAME_SYSTEM_SHORT_LABELS = Object.fromEntries(
  listGameSystemUiDefinitions().map((definition) => [definition.id, definition.shortLabel]),
) as Record<string, string>;

/**
 * Descriptions for each game system
 */
export const GAME_SYSTEM_DESCRIPTIONS = Object.fromEntries(
  listGameSystemUiDefinitions().map((definition) => [definition.id, definition.description]),
) as Record<string, string>;

/**
 * Options array for form selects
 */
export interface GameSystemOption {
  value: string;
  label: string;
  shortLabel: string;
  description: string;
}

export const GAME_SYSTEM_OPTIONS: GameSystemOption[] = listSelectableGameSystemUiDefinitions().map(
  (definition) => ({
    value: definition.id,
    label: definition.label,
    shortLabel: definition.shortLabel,
    description: definition.description,
  }),
);

export function getGameSystemOptions(): GameSystemOption[] {
  return listSelectableGameSystemUiDefinitions().map((definition) => ({
    value: definition.id,
    label: definition.label,
    shortLabel: definition.shortLabel,
    description: definition.description,
  }));
}

/**
 * Get display label for a game system
 * @param gameSystem - The game system enum value
 * @param useShort - Whether to use short label (default: false)
 * @returns The display label
 */
export function getGameSystemLabel(
  gameSystem: string | null,
  useShort: boolean = false
): string {
  if (!gameSystem) {
    return 'No System Selected';
  }
  const definition = getGameSystemUiDefinition(gameSystem);
  return useShort
    ? definition?.shortLabel ?? gameSystem
    : definition?.label ?? gameSystem;
}

/**
 * Get description for a game system
 * @param gameSystem - The game system enum value
 * @returns The description
 */
export function getGameSystemDescription(gameSystem: string | null): string {
  if (!gameSystem) {
    return 'Select a game system for this campaign or character.';
  }
  return getGameSystemUiDefinition(gameSystem)?.description ?? gameSystem;
}
