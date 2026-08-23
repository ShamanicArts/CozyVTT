export interface TokenTemplateQuery {
  campaignId: string;
  search?: string;
  type?: "player" | "npc" | "object";
  limit: number;
  offset: number;
}

export interface TokenTemplateQueryRepository {
  list(input: TokenTemplateQuery): Promise<{
    templates: Record<string, unknown>[];
    total: number;
  }>;
  find(id: string): Promise<Record<string, unknown> | null>;
}
