export interface QueryMetadata {
  id: string;
  version: string;
  risk: "READ";
  inputSchema: unknown;
  outputSchema: unknown;
  title?: string;
  description?: string;
  requiredPermissions?: readonly "READ"[];
  operatingRoles?: readonly ("DM" | "PLAYER" | "SPECTATOR")[];
  resultRedactionPolicy?: string;
  bounds?: { maxItems?: number; maxResultBytes?: number; maxWaitMs?: number };
}
export interface PublicQueryDescriptor extends QueryMetadata {
  title: string;
  description: string;
  requiredPermissions: readonly "READ"[];
  operatingRoles: readonly ("DM" | "PLAYER" | "SPECTATOR")[];
  resultRedactionPolicy: string;
  bounds: { maxItems?: number; maxResultBytes: number; maxWaitMs?: number };
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
  list(): PublicQueryDescriptor[] {
    return [...this.queries.values()].map((query) => ({
      ...query.metadata,
      title: query.metadata.title ?? query.metadata.id,
      description: query.metadata.description ?? `Read ${query.metadata.id}.`,
      requiredPermissions: query.metadata.requiredPermissions ?? ["READ"],
      operatingRoles: query.metadata.operatingRoles ?? ["DM", "PLAYER", "SPECTATOR"],
      resultRedactionPolicy:
        query.metadata.resultRedactionPolicy ?? "campaign-role-v1",
      bounds: {
        maxResultBytes: 262_144,
        ...query.metadata.bounds,
      },
    }));
  }
  async dispatch<I, O>(
    id: string,
    input: I,
    context: QueryContext,
  ): Promise<O> {
    const query = this.queries.get(id);
    if (!query) throw new Error(`Unknown query ${id}`);
    if (
      context.role &&
      query.metadata.operatingRoles &&
      !query.metadata.operatingRoles.includes(context.role)
    )
      throw new Error("Query role denied");
    const result = await query.execute(input, context);
    const maxResultBytes = query.metadata.bounds?.maxResultBytes ?? 262_144;
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > maxResultBytes)
      throw new Error("Query result exceeds descriptor bounds");
    return result as O;
  }
}
