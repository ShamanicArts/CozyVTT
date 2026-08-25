/**
 * Game Systems Constants
 * Display labels, descriptions, and form options for game systems
 */

import { GameSystem } from '../types';
import {
  listGameSystemUiDefinitions,
  listSelectableGameSystemUiDefinitions,
} from '../game-systems/registry';

/**
 * Display labels for each game system
 */
export const GAME_SYSTEM_LABELS = Object.fromEntries(
  listGameSystemUiDefinitions().map((definition) => [definition.id, definition.label]),
) as Record<GameSystem, string>;

/**
 * Short display labels for each game system
 */
export const GAME_SYSTEM_SHORT_LABELS = Object.fromEntries(
  listGameSystemUiDefinitions().map((definition) => [definition.id, definition.shortLabel]),
) as Record<GameSystem, string>;

/**
 * Descriptions for each game system
 */
export const GAME_SYSTEM_DESCRIPTIONS = Object.fromEntries(
  listGameSystemUiDefinitions().map((definition) => [definition.id, definition.description]),
) as Record<GameSystem, string>;

/**
 * Options array for form selects
 */
export interface GameSystemOption {
  value: GameSystem;
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

/**
 * Get display label for a game system
 * @param gameSystem - The game system enum value
 * @param useShort - Whether to use short label (default: false)
 * @returns The display label
 */
export function getGameSystemLabel(
  gameSystem: GameSystem | null,
  useShort: boolean = false
): string {
  if (!gameSystem) {
    return 'No System Selected';
  }
  return useShort
    ? GAME_SYSTEM_SHORT_LABELS[gameSystem]
    : GAME_SYSTEM_LABELS[gameSystem];
}

/**
 * Get description for a game system
 * @param gameSystem - The game system enum value
 * @returns The description
 */
export function getGameSystemDescription(gameSystem: GameSystem | null): string {
  if (!gameSystem) {
    return 'Select a game system for this campaign or character.';
  }
  return GAME_SYSTEM_DESCRIPTIONS[gameSystem];
}
