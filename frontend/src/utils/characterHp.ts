/**
 * Character HP extraction utility
 * Extracts { current, max, temp } from character sheet data
 * in a game-system-aware way, since each system stores HP differently.
 */

export interface CharacterHpInfo {
  current: number;
  max: number;
  temp: number;
}

export function extractCharacterHp(
  gameSystem: string | null,
  data: Record<string, unknown> | null | undefined
): CharacterHpInfo | null {
  if (!data || !gameSystem) return null;
   
  const d = data;

  switch (gameSystem) {
    case 'DND_5E':
    case 'PATHFINDER_2E':
    case 'FLEXIBLE': {
      const hp = isRecord(d.hp) ? d.hp : null;
      if (hp && typeof hp.maximum === 'number' && hp.maximum > 0) {
        return {
          current: typeof hp.current === 'number' ? hp.current : hp.maximum,
          max: hp.maximum,
          temp: typeof hp.temporary === 'number' ? hp.temporary : 0,
        };
      }
      return null;
    }
    case 'CALL_OF_CTHULHU_7E': {
      const derivedStats = isRecord(d.derivedStats) ? d.derivedStats : null;
      const hp = derivedStats && isRecord(derivedStats.hp) ? derivedStats.hp : null;
      if (hp && typeof hp.maximum === 'number' && hp.maximum > 0) {
        return {
          current: typeof hp.current === 'number' ? hp.current : hp.maximum,
          max: hp.maximum,
          temp: 0,
        };
      }
      return null;
    }
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
