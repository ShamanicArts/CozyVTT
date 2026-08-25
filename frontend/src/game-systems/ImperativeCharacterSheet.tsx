import { useEffect, useRef, type ComponentType } from 'react';
import type { CharacterSheetProps } from '@/components/character-sheets/types';

export interface ImperativeCharacterSheetContext {
  readonly character: {
    readonly id: string;
    readonly name: string;
    readonly gameSystem: string;
    readonly data: Readonly<Record<string, unknown>>;
    readonly tokenImageUrl?: string | null;
  };
  readonly mode: 'view' | 'edit';
  save(data: Readonly<Record<string, unknown>>, tokenImageUrl?: string): Promise<void>;
  cancel(): void;
  roll?(expression: string, purpose: string): void;
}

export interface ImperativeCharacterSheetInstance {
  update(context: ImperativeCharacterSheetContext): void;
  dispose(): void;
}

export interface ImperativeCharacterSheetContribution {
  readonly id: string;
  mount(
    element: HTMLElement,
    context: ImperativeCharacterSheetContext,
  ): ImperativeCharacterSheetInstance | Promise<ImperativeCharacterSheetInstance>;
}

export function createImperativeCharacterSheet(
  contribution: ImperativeCharacterSheetContribution,
): ComponentType<CharacterSheetProps> {
  return function ExtensionCharacterSheet(props) {
    const mountRef = useRef<HTMLDivElement>(null);
    const instanceRef = useRef<ImperativeCharacterSheetInstance | null>(null);
    const context = createContext(props);
    const contextRef = useRef(context);
    contextRef.current = context;

    useEffect(() => {
      const element = mountRef.current;
      if (!element) return;
      let disposed = false;
      void Promise.resolve(contribution.mount(element, contextRef.current)).then((instance) => {
        if (disposed) instance.dispose();
        else {
          instance.update(contextRef.current);
          instanceRef.current = instance;
        }
      });
      return () => {
        disposed = true;
        instanceRef.current?.dispose();
        instanceRef.current = null;
      };
    }, []);

    useEffect(() => {
      instanceRef.current?.update(context);
    }, [context]);

    return <div ref={mountRef} className="h-full min-h-0" />;
  };
}

function createContext(props: CharacterSheetProps): ImperativeCharacterSheetContext {
  const data = typeof props.character.data === 'object' && props.character.data !== null
    ? Object.fromEntries(Object.entries(props.character.data))
    : {};
  return {
    character: {
      id: props.character.id,
      name: props.character.name,
      gameSystem: props.character.gameSystem ?? '',
      data,
      tokenImageUrl: props.character.tokenImageUrl,
    },
    mode: props.mode,
    save: async (nextData, tokenImageUrl) => {
      await props.onSave?.(nextData, false, tokenImageUrl);
    },
    cancel: () => props.onCancel?.(),
    ...(props.onRoll ? { roll: props.onRoll } : {}),
  };
}
