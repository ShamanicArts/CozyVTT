/**
 * Character Sheet Router
 * Routes to appropriate character sheet component based on game system
 * Uses lazy loading for code splitting and performance
 */

import React, { Suspense } from 'react';
import { getGameSystemUiDefinition } from '@/game-systems/registry';
import { CharacterSheetProps } from './types';
import { FlexibleCharacterSheet } from './FlexibleCharacterSheet';
import { CharacterSheetLoadingSpinner } from './LoadingSpinner';
import { CharacterSheetErrorBoundary } from './ErrorBoundary';

export interface CharacterSheetRouterProps extends CharacterSheetProps {}

/**
 * CharacterSheetRouter Component
 *
 * Routes to the appropriate character sheet based on character.gameSystem.
 * - D&D 5e → DnD5eCharacterSheet
 * - Pathfinder 2e → Pathfinder2eCharacterSheet
 * - Shadowrun 6e → Shadowrun6eCharacterSheet
 * - Call of Cthulhu 7e → CallOfCthulhu7eCharacterSheet
 * - null/undefined → FlexibleCharacterSheet (system-agnostic JSON editor)
 *
 * Uses React.lazy() for code splitting - each game system's sheet is loaded
 * only when needed, reducing initial bundle size.
 */
export const CharacterSheetRouter: React.FC<CharacterSheetRouterProps> = (
  props
) => {
  const { character } = props;

  const renderSheet = () => {
    if (!character.gameSystem) return <FlexibleCharacterSheet {...props} />;

    const definition = getGameSystemUiDefinition(character.gameSystem);
    if (definition) {
      const CharacterSheet = definition.characterSheet;
      return <CharacterSheet {...props} />;
    }

    console.warn(
      `Unknown game system: ${character.gameSystem}. Falling back to FlexibleCharacterSheet.`
    );
    return <FlexibleCharacterSheet {...props} />;
  };

  return (
    <CharacterSheetErrorBoundary>
      <Suspense fallback={<CharacterSheetLoadingSpinner />}>
        {renderSheet()}
      </Suspense>
    </CharacterSheetErrorBoundary>
  );
};
