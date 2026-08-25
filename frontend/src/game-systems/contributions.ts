import type { ActiveExtensionGameSystemContribution } from '@/types/extensions';
import {
  createImperativeCharacterSheet,
  type ImperativeCharacterSheetContribution,
} from './ImperativeCharacterSheet';
import { registerExtensionGameSystemUi } from './registry';

interface GameSystemPluginApi {
  readonly contractVersion: '1';
  registerCharacterSheet(contribution: ImperativeCharacterSheetContribution): () => void;
}

type GameSystemActivator = (
  api: GameSystemPluginApi,
) => void | (() => void) | Promise<void | (() => void)>;

export type GameSystemModuleImporter = (url: string) => Promise<unknown>;

const runtimeImport: GameSystemModuleImporter = (url) =>
  import(/* @vite-ignore */ url) as Promise<unknown>;

export async function activateGameSystemContributions(
  contributions: readonly ActiveExtensionGameSystemContribution[],
  importer: GameSystemModuleImporter = runtimeImport,
): Promise<() => void> {
  const disposers: Array<() => void> = [];
  for (const active of contributions) {
    const ownedDisposers: Array<() => void> = [];
    let registered = false;
    try {
      const imported = await importer(active.gameSystem.moduleUrl);
      const activate = readActivator(imported);
      const dispose = await activate({
        contractVersion: '1',
        registerCharacterSheet: (sheet) => {
          if (registered) {
            throw new Error('A game-system module may register exactly one character sheet.');
          }
          if (sheet.id !== active.gameSystem.id) {
            throw new Error('Character-sheet ID must match its game-system descriptor.');
          }
          const registration = registerExtensionGameSystemUi(active.extensionId, {
            id: active.gameSystem.id,
            label: active.gameSystem.name,
            shortLabel: active.gameSystem.shortName,
            description: active.gameSystem.description,
            selectable: active.gameSystem.selectable,
            characterTemplates: active.gameSystem.characterTemplates.map((template) => ({
              value: template.id,
              label: template.name,
              description: template.description,
            })),
            characterSheet: createImperativeCharacterSheet(sheet),
          });
          registered = true;
          ownedDisposers.push(registration);
          return registration;
        },
      });
      if (!registered) {
        throw new Error('Game-system module did not register its declared character sheet.');
      }
      if (typeof dispose === 'function' && !ownedDisposers.includes(dispose)) {
        ownedDisposers.push(dispose);
      }
      disposers.push(() => disposeAll(ownedDisposers));
    } catch (error) {
      disposeAll(ownedDisposers);
      console.error(
        `[CozyVTT game system] Could not activate ${active.extensionId}/${active.gameSystem.id}.`,
        error,
      );
    }
  }
  return () => disposeAll(disposers);
}

function readActivator(imported: unknown): GameSystemActivator {
  if (typeof imported !== 'object' || imported === null) {
    throw new Error('Game-system module must export activateGameSystem.');
  }
  const activate = (imported as Record<string, unknown>)['activateGameSystem'];
  if (typeof activate !== 'function') {
    throw new Error('Game-system module must export activateGameSystem.');
  }
  return activate as GameSystemActivator;
}

function disposeAll(disposers: Array<() => void>): void {
  for (const dispose of disposers.splice(0).reverse()) dispose();
}
