export interface QueryMetadata {
  id: string;
  version: string;
  risk: "READ";
  inputSchema: unknown;
  outputSchema: unknown;
}
export interface QueryContext {
  principalId: string;
  campaignId: string;
  role?: "DM" | "PLAYER" | "SPECTATOR";
}
export interface Query<I = unknown, O = unknown> {
  metadata: QueryMetadata;
  execute(input: I, context: QueryContext): Promise<O>;
}
export class QueryHost {
  private readonly queries = new Map<string, Query>();
  register<I, O>(query: Query<I, O>): void {
    if (this.queries.has(query.metadata.id))
      throw new Error(`Duplicate query ${query.metadata.id}`);
    this.queries.set(query.metadata.id, query as Query);
  }
  list(): QueryMetadata[] {
    return [...this.queries.values()].map((query) => query.metadata);
  }
  async dispatch<I, O>(
    id: string,
    input: I,
    context: QueryContext,
  ): Promise<O> {
    const query = this.queries.get(id);
    if (!query) throw new Error(`Unknown query ${id}`);
    return query.execute(input, context) as Promise<O>;
  }
}
