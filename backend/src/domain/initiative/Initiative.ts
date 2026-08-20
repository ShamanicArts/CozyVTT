/**
 * Ephemeral combat state and the persisted token fields it derives from.
 * These types deliberately contain no Socket.IO, Prisma, or dice-parser
 * dependencies so the same commands can later power agent and HTTP adapters.
 */
export interface InitiativeHp {
  current: number;
  max: number;
  temp: number;
}

export interface InitiativeToken {
  id: string;
  name: string;
  imageUrl?: string | null;
  initiative?: number | null;
  hp?: InitiativeHp | null;
  type?: 'player' | 'npc' | 'object';
  disposition?: 'friendly' | 'neutral' | 'hostile' | null;
  [key: string]: unknown;
}

export interface InitiativeCombatant {
  tokenId: string;
  name: string;
  imageUrl: string;
  initiative: number | null;
  hp: InitiativeHp | null;
  type: 'player' | 'npc' | 'object';
  disposition: 'friendly' | 'neutral' | 'hostile' | null;
}

export interface InitiativeState {
  active: boolean;
  round: number;
  currentTokenId: string | null;
  combatants: InitiativeCombatant[];
}

export interface InitiativeMap {
  id: string;
  campaignId: string;
  tokens: InitiativeToken[];
}

export class InitiativeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'InitiativeError';
  }
}

export function sortInitiativeCombatants(combatants: InitiativeCombatant[]): InitiativeCombatant[] {
  return [...combatants].sort((a, b) => {
    if (a.initiative === null && b.initiative === null) return a.name.localeCompare(b.name);
    if (a.initiative === null) return 1;
    if (b.initiative === null) return -1;
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    return a.name.localeCompare(b.name);
  });
}

export function toInitiativeCombatant(token: InitiativeToken): InitiativeCombatant {
  return {
    tokenId: token.id,
    name: token.name,
    imageUrl: token.imageUrl || '',
    initiative: token.initiative ?? null,
    hp: token.hp ?? null,
    type: token.type ?? 'npc',
    disposition: token.disposition ?? null,
  };
}

export function emptyInitiativeState(): InitiativeState {
  return { active: false, round: 0, currentTokenId: null, combatants: [] };
}
