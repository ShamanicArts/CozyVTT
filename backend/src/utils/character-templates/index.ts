/**
 * Character Templates Index
 * Unified interface for getting character templates for all game systems
 * Character Management
 */

import {
  getGameSystemDefinition,
  listGameSystemDefinitions,
} from '../../game-systems/registry';

export interface CharacterTemplate {
  name: string;
  description: string;
  gameSystem: string;
  data: object;
}

/**
 * Get all available templates for a specific game system
 * @param gameSystem - The game system to get templates for
 * @returns Array of available templates
 */
export function getTemplatesForGameSystem(
  gameSystem: string
): CharacterTemplate[] {
  return getGameSystemDefinition(gameSystem)?.getCharacterTemplates() ?? [];
}

/**
 * Get a specific template for a game system
 * @param gameSystem - The game system
 * @param templateName - Optional template name (defaults to 'blank')
 * @returns The character template
 */
export function getCharacterTemplate(
  gameSystem: string,
  templateName?: string
): CharacterTemplate {
  const definition = getGameSystemDefinition(gameSystem);
  if (!definition) throw new Error(`Unsupported game system: ${gameSystem}`);
  return definition.getCharacterTemplate(templateName);
}

/**
 * Get a blank template for any game system
 * @param gameSystem - The game system
 * @returns The blank character template
 */
export function getBlankTemplate(gameSystem: string): CharacterTemplate {
  return getCharacterTemplate(gameSystem, 'blank');
}

/**
 * Get all templates for all game systems (useful for browsing)
 * @returns Object with game systems as keys and template arrays as values
 */
export function getAllTemplates(): Record<string, CharacterTemplate[]> {
  return Object.fromEntries(
    listGameSystemDefinitions().map((definition) => [
      definition.id,
      definition.getCharacterTemplates(),
    ]),
  ) as Record<string, CharacterTemplate[]>;
}
