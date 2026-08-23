import type { AccessQueryRepository } from "../../ports/AccessQueryRepository";

export class AccessQueries {
  constructor(private readonly access: AccessQueryRepository) {}
  campaignMembership(userId: string, campaignId: string) {
    return this.access.campaignMembership(userId, campaignId);
  }
  mustChangePassword(userId: string) {
    return this.access.mustChangePassword(userId);
  }
}
