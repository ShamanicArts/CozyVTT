export interface CampaignInvitationNotification {
  invitationId: string;
  campaignId: string;
  campaignName: string;
  campaignDescription: string | null;
  invitedBy: string;
  invitedUserId: string;
  invitedUserEmail: string;
  invitedUserDisplayName: string;
  inviterDisplayName: string;
}

export interface CampaignInvitationNotifier {
  notify(input: CampaignInvitationNotification): Promise<void>;
}
