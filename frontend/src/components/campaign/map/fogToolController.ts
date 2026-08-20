import type { FogState } from '@/types/walls';

export function revealAllFog(state: FogState | null): FogState | null {
  return state ? { ...state, revealed: new Array(state.revealed.length).fill(true) } : state;
}

export function hideAllFog(state: FogState | null): FogState | null {
  return state ? { ...state, revealed: new Array(state.revealed.length).fill(false) } : state;
}
