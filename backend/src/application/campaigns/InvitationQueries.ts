import type { InvitationQueryRepository } from "../../ports/InvitationQueryRepository";

export class InvitationQueries {
  constructor(private readonly invitations: InvitationQueryRepository) {}

  pendingForUser(userId: string) {
    return this.invitations.pendingForUser(userId);
  }
}
