export interface AdminAuditLog {
  record(
    actorId: string,
    message: string,
    level?: "INFO" | "WARNING" | "ERROR" | "CRITICAL",
    context?: Record<string, unknown>,
  ): Promise<void>;
}
