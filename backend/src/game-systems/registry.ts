import { z } from 'zod';
import { GameSystem as PersistedGameSystem } from '@prisma/client';
import { GameSystem } from './index';
import {
  dnd5eCharacterDataSchema,
  type DnD5eCharacterData,
} from '../validators/game-systems/dnd5e.schema';
import {
  pathfinder2eCharacterDataSchema,
  type PF2eCharacterData,
} from '../validators/game-systems/pathfinder2e.schema';
import {
  shadowrun6eCharacterDataSchema,
  type SR6CharacterData,
} from '../validators/game-systems/shadowrun6e.schema';
import {
  callOfCthulhu7eCharacterDataSchema,
  type CoC7eCharacterData,
} from '../validators/game-systems/callOfCthulhu7e.schema';
import {
  getDnD5eTemplate,
  getDnD5eTemplates,
} from '../utils/character-templates/dnd5e-templates';
import {
  getPF2eTemplate,
  getPF2eTemplates,
} from '../utils/character-templates/pathfinder2e-templates';
import {
  getSR6Template,
  getSR6Templates,
} from '../utils/character-templates/shadowrun6e-templates';
import {
  getCoC7eTemplate,
  getCoC7eTemplates,
} from '../utils/character-templates/callOfCthulhu7e-templates';

export type RegisteredCharacterData =
  | DnD5eCharacterData
  | PF2eCharacterData
  | SR6CharacterData
  | CoC7eCharacterData;

export type GameSystemValidationResult =
  | { success: true; data: RegisteredCharacterData }
  | { success: false; errors: z.ZodError };

export interface RegisteredCharacterTemplate {
  name: string;
  description: string;
  gameSystem: PersistedGameSystem;
  data: object;
}

export interface GameSystemDefinition {
  id: GameSystem;
  validateCharacterData(data: unknown): GameSystemValidationResult;
  getCharacterTemplates(): RegisteredCharacterTemplate[];
  getCharacterTemplate(templateName?: string): RegisteredCharacterTemplate;
}

function validateWith(
  schema: z.ZodType<RegisteredCharacterData>,
  data: unknown,
): GameSystemValidationResult {
  const result = schema.safeParse(data);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, errors: result.error };
}

const definitions: readonly GameSystemDefinition[] = [
  {
    id: GameSystem.DND_5E,
    validateCharacterData: (data) => validateWith(dnd5eCharacterDataSchema, data),
    getCharacterTemplates: getDnD5eTemplates,
    getCharacterTemplate: getDnD5eTemplate,
  },
  {
    id: GameSystem.PATHFINDER_2E,
    validateCharacterData: (data) => validateWith(pathfinder2eCharacterDataSchema, data),
    getCharacterTemplates: getPF2eTemplates,
    getCharacterTemplate: getPF2eTemplate,
  },
  {
    id: GameSystem.SHADOWRUN_6E,
    validateCharacterData: (data) => validateWith(shadowrun6eCharacterDataSchema, data),
    getCharacterTemplates: getSR6Templates,
    getCharacterTemplate: getSR6Template,
  },
  {
    id: GameSystem.CALL_OF_CTHULHU_7E,
    validateCharacterData: (data) => validateWith(callOfCthulhu7eCharacterDataSchema, data),
    getCharacterTemplates: getCoC7eTemplates,
    getCharacterTemplate: getCoC7eTemplate,
  },
];

export function listGameSystemDefinitions(): readonly GameSystemDefinition[] {
  return definitions;
}

export function getGameSystemDefinition(
  gameSystem: string,
): GameSystemDefinition | undefined {
  return definitions.find((definition) => definition.id === gameSystem);
}

export function isSupportedGameSystem(gameSystem: string): gameSystem is GameSystem {
  return getGameSystemDefinition(gameSystem) !== undefined;
}

export function getSupportedGameSystemIds(): GameSystem[] {
  return definitions.map((definition) => definition.id);
}
