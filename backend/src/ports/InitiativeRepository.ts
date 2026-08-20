import { InitiativeMap, InitiativeToken } from '../domain/initiative/Initiative';

/** Persistence boundary for token initiative values and the roller's display name. */
export interface InitiativeRepository {
  findMap(mapId: string): Promise<InitiativeMap | null>;
  updateTokens(mapId: string, expectedRevision: number, tokens: InitiativeToken[]): Promise<number>;
  findUserDisplayName(userId: string): Promise<string | null>;
}
