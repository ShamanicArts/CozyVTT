export interface InvitationQueryRepository {
  pendingForUser(userId: string): Promise<Record<string, unknown>[]>;
}
