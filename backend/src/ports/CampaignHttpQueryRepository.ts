export interface CampaignMembershipWithCampaign {
  campaign: object;
  role: string;
  characterIds: string[];
}

export interface CampaignDetails extends Record<string, unknown> {
  sessions: Array<{ id: string; sessionNumber: number; startedAt: Date }>;
}

export interface CampaignRosterMembership {
  userId: string;
  role: string;
  joinedAt: Date;
  characterIds: string[];
  user: { displayName: string; avatarUrl: string | null };
}

export interface CampaignRosterCharacter {
  id: string;
  name: string;
  tokenImageUrl: string | null;
  gameSystem: string | null;
  userId: string | null;
  data: unknown;
}

export interface CampaignMessage {
  id: string;
  userId: string | null;
  type: string;
  content: string;
  metadata: unknown;
  createdAt: Date;
  user: { id: string; displayName: string } | null;
}

export interface CampaignHttpQueryRepository {
  membershipsForUser(userId: string): Promise<CampaignMembershipWithCampaign[]>;
  details(campaignId: string): Promise<CampaignDetails | null>;
  characterRoster(campaignId: string): Promise<{
    memberships: CampaignRosterMembership[];
    characters: CampaignRosterCharacter[];
  }>;
  invitableUsers(campaignId: string): Promise<object[]>;
  allCampaigns(): Promise<object[]>;
  messages(
    campaignId: string,
    limit: number,
    offset: number,
  ): Promise<{ messages: CampaignMessage[]; total: number }>;
}
