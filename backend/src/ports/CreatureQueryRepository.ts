export interface CreatureListQuery {
  campaignId: string;
  search?: string;
  source?: string;
  challengeRating?: string;
  gameSystem?: string;
  limit: number;
  offset: number;
}

export interface CreatureQueryRepository {
  seedStatus(): Promise<{ srdCount: number; customCount: number }>;
  list(input: CreatureListQuery): Promise<{
    creatures: Record<string, unknown>[];
    total: number;
  }>;
  find(id: string): Promise<Record<string, unknown> | null>;
  favorites(
    campaignId: string,
    userId: string,
  ): Promise<Array<{ creatureId: string; creature: Record<string, unknown> }>>;
}
