/** The first arbitration step for a map pointer-down event. */
export type MapPointerIntent = 'tool-pan' | 'primary-action' | 'ignore';

export function resolveMapPointerIntent(input: {
  button: number;
  isDM: boolean;
  wallMode: string | null;
  fogMode: string | null;
  lightMode: string | null;
}): MapPointerIntent {
  const toolIsActive = input.wallMode !== null || input.fogMode !== null || input.lightMode !== null;
  if (input.button === 2 && input.isDM && toolIsActive) return 'tool-pan';
  return input.button === 0 ? 'primary-action' : 'ignore';
}
