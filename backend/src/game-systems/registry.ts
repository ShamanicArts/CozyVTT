import { z } from 'zod';
import Ajv, { type ErrorObject } from 'ajv';
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
  | CoC7eCharacterData
  | Record<string, unknown>;

export type GameSystemValidationResult =
  | { success: true; data: RegisteredCharacterData }
  | { success: false; errors: z.ZodError };

export interface RegisteredCharacterTemplate {
  name: string;
  description: string;
  gameSystem: string;
  data: object;
}

export interface GameSystemDefinition {
  id: string;
  validateCharacterData(data: unknown): GameSystemValidationResult;
  getCharacterTemplates(): RegisteredCharacterTemplate[];
  getCharacterTemplate(templateName?: string): RegisteredCharacterTemplate;
}

export interface ExtensionGameSystemDefinitionInput {
  readonly id: string;
  readonly characterDataSchema: Readonly<Record<string, unknown>>;
  readonly characterTemplates: readonly {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly data: Readonly<Record<string, unknown>>;
  }[];
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

const builtInDefinitions: readonly GameSystemDefinition[] = [
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

const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
const extensionDefinitions = new Map<string, Map<string, GameSystemDefinition>>();
const extensionOwners = new Map<string, string>();

export function registerExtensionGameSystems(
  extensionId: string,
  contributions: readonly ExtensionGameSystemDefinitionInput[],
): void {
  if (extensionDefinitions.has(extensionId)) {
    throw new Error(`Game systems are already registered for ${extensionId}`);
  }
  const contributionIds = new Set<string>();
  for (const contribution of contributions) {
    if (contributionIds.has(contribution.id)) {
      throw new Error(`Game system ${contribution.id} is declared more than once`);
    }
    contributionIds.add(contribution.id);
    const owner = extensionOwners.get(contribution.id);
    if (owner && owner !== extensionId) {
      throw new Error(`Game system ${contribution.id} is already owned by ${owner}`);
    }
  }

  const registered = new Map<string, GameSystemDefinition>();
  for (const contribution of contributions) {
    const validate = ajv.compile(contribution.characterDataSchema);
    for (const template of contribution.characterTemplates) {
      if (!validate(template.data)) {
        throw new Error(
          `Character template ${contribution.id}/${template.id} does not match its schema: ${ajv.errorsText(validate.errors)}`,
        );
      }
    }
    registered.set(contribution.id, {
      id: contribution.id,
      validateCharacterData: (data) => {
        if (validate(data)) {
          return { success: true, data: data as Record<string, unknown> };
        }
        return { success: false, errors: ajvErrors(validate.errors) };
      },
      getCharacterTemplates: () => contribution.characterTemplates.map((template) => ({
        name: template.name,
        description: template.description,
        gameSystem: contribution.id,
        data: { ...template.data },
      })),
      getCharacterTemplate: (templateName = 'blank') => {
        const template = contribution.characterTemplates.find(
          (candidate) => candidate.id === templateName,
        );
        if (!template) throw new Error(`Unknown template: ${templateName}`);
        return {
          name: template.name,
          description: template.description,
          gameSystem: contribution.id,
          data: { ...template.data },
        };
      },
    });
  }
  for (const contribution of contributions) {
    extensionOwners.set(contribution.id, extensionId);
  }
  extensionDefinitions.set(extensionId, registered);
}

export function unregisterExtensionGameSystems(extensionId: string): void {
  const registered = extensionDefinitions.get(extensionId);
  if (!registered) return;
  for (const gameSystemId of registered.keys()) extensionOwners.delete(gameSystemId);
  extensionDefinitions.delete(extensionId);
}

export const extensionGameSystemRegistry = {
  register: registerExtensionGameSystems,
  unregister: unregisterExtensionGameSystems,
};

export function listGameSystemDefinitions(): readonly GameSystemDefinition[] {
  const overlaidIds = new Set(extensionOwners.keys());
  return [
    ...builtInDefinitions.filter((definition) => !overlaidIds.has(definition.id)),
    ...[...extensionDefinitions.values()].flatMap((registered) => [...registered.values()]),
  ];
}

export function getGameSystemDefinition(
  gameSystem: string,
): GameSystemDefinition | undefined {
  const owner = extensionOwners.get(gameSystem);
  return owner
    ? extensionDefinitions.get(owner)?.get(gameSystem)
    : builtInDefinitions.find((definition) => definition.id === gameSystem);
}

export function isSupportedGameSystem(gameSystem: string): boolean {
  return getGameSystemDefinition(gameSystem) !== undefined;
}

export function getSupportedGameSystemIds(): string[] {
  return listGameSystemDefinitions().map((definition) => definition.id);
}

function ajvErrors(errors: ErrorObject[] | null | undefined): z.ZodError {
  return new z.ZodError(
    (errors ?? []).map((error) => ({
      code: 'custom',
      message: error.message ?? 'Character data does not match the game system schema',
      path: error.instancePath
        .split('/')
        .filter(Boolean)
        .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~')),
    })),
  );
}
