export interface AdminQueryRepository {
  stats(): Promise<Record<string, unknown>>;
  activity(): Promise<Record<string, unknown>>;
}
