import {
  CampaignCharacterRecord,
  CampaignInvitationContext,
  CampaignInvitationRecord,
  CampaignMembershipRecord,
  CampaignRecord,
  CampaignRole,
  CampaignUpdateData,
  CampaignUserRecord,
  InvitationWithCampaign,
} from '../domain/campaigns/Campaign';

/** Persistence boundary for campaign lifecycle, roster, and invitations. */
export interface CampaignAdministrationRepository {
  createCampaign(data: { name: string; description: string; ownerId: string; vibeSettings: unknown; gameSystem: string | null }): Promise<CampaignRecord>;
  createMembership(data: { userId: string; campaignId: string; role: CampaignRole; characterIds: string[] }): Promise<CampaignMembershipRecord>;
  findCampaignWithMemberships(campaignId: string): Promise<Record<string, unknown> | null>;

  countCampaignCharacters(campaignId: string): Promise<number>;
  updateCampaign(campaignId: string, data: CampaignUpdateData): Promise<CampaignRecord>;
  findCampaignVibe(campaignId: string): Promise<Pick<CampaignRecord, 'currentVibe'> | null>;
  updateCampaignVibe(campaignId: string, data: { vibeSettings: unknown; currentVibe?: null }): Promise<{ id: string; vibeSettings: unknown; currentVibe: string | null }>;

  findCampaignOwner(campaignId: string): Promise<{ ownerId: string } | null>;
  rehomeCampaignAssets(campaignId: string): Promise<void>;
  deleteCampaign(campaignId: string): Promise<void>;

  findUser(userId: string): Promise<CampaignUserRecord | null>;
  findMembership(userId: string, campaignId: string): Promise<CampaignMembershipRecord | null>;
  findInvitationForUserAndCampaign(userId: string, campaignId: string): Promise<CampaignInvitationRecord | null>;
  findCampaignInvitationInfo(campaignId: string): Promise<{ name: string; description: string | null } | null>;
  findUserDisplayName(userId: string): Promise<string | null>;
  upsertPendingInvitation(data: { userId: string; campaignId: string; expiresAt: Date | null }): Promise<CampaignInvitationContext>;
  deleteMembership(userId: string, campaignId: string): Promise<void>;
  findDungeonMaster(campaignId: string): Promise<CampaignMembershipRecord | null>;
  updateMembershipRole(userId: string, campaignId: string, role: CampaignRole): Promise<CampaignMembershipRecord>;

  findInvitationWithCampaign(invitationId: string): Promise<InvitationWithCampaign | null>;
  findInvitation(invitationId: string): Promise<CampaignInvitationRecord | null>;
  findCharactersForUser(characterIds: string[], userId: string): Promise<CampaignCharacterRecord[]>;
  acceptInvitation(data: { invitationId: string; userId: string; campaignId: string; characterIds: string[] }): Promise<CampaignMembershipRecord>;
  updateInvitationStatus(invitationId: string, status: 'DECLINED'): Promise<void>;
}
