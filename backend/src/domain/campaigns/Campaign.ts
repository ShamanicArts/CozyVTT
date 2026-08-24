/** Transport- and persistence-neutral campaign administration concepts. */

export type CampaignRole = 'DM' | 'PLAYER' | 'SPECTATOR';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';

export interface CampaignRecord extends Record<string, unknown> {
  id: string;
  ownerId: string;
  currentVibe: string | null;
  gameSystem: string | null;
  activePresentationId: string;
}

export interface CampaignMembershipRecord extends Record<string, unknown> {
  userId: string;
  campaignId: string;
  role: CampaignRole;
  characterIds: string[];
}

export interface CampaignInvitationRecord extends Record<string, unknown> {
  id: string;
  userId: string;
  campaignId: string;
  status: InvitationStatus;
  expiresAt: Date | null;
}

export interface InvitationCampaignRecord extends CampaignRecord {
  name: string;
  description: string | null;
}

export interface InvitationWithCampaign extends CampaignInvitationRecord {
  campaign: InvitationCampaignRecord;
}

export interface CampaignUserRecord {
  id: string;
  email: string;
  displayName: string;
}

export interface CampaignInvitationContext {
  invitation: CampaignInvitationRecord;
  campaign: { id: string; name: string };
}

export interface CampaignCharacterRecord {
  id: string;
  name: string;
  campaignId: string | null;
  gameSystem: string | null;
}

export interface CampaignUpdateData {
  name?: unknown;
  description?: unknown;
  status?: unknown;
  vibeSettings?: unknown;
  spiritLayerEnabled?: unknown;
  spiritLayerStyle?: unknown;
  gameSystem?: string | null;
  chatCooldownEnabled?: unknown;
  chatCooldownSeconds?: number;
}

export class CampaignCommandError extends Error {
  constructor(
    public readonly code:
      | 'VALIDATION'
      | 'FORBIDDEN'
      | 'USER_NOT_FOUND'
      | 'ALREADY_MEMBER'
      | 'PENDING_INVITATION'
      | 'MEMBER_NOT_FOUND'
      | 'DM_MEMBER_PROTECTED'
      | 'DM_ALREADY_EXISTS'
      | 'INVITATION_NOT_FOUND'
      | 'INVITATION_UNAUTHORIZED'
      | 'INVITATION_PROCESSED'
      | 'INVITATION_EXPIRED'
      | 'INVALID_CHARACTER_SELECTION'
      | 'CHARACTER_ASSIGNED'
      | 'CHARACTER_INCOMPATIBLE',
    public readonly status: 400 | 403 | 404,
    public readonly error: 'Validation Error' | 'Forbidden' | 'Not Found' | 'Bad Request' | undefined,
    message: string
  ) {
    super(message);
    this.name = 'CampaignCommandError';
  }
}

export const campaignValidationError = (message: string) =>
  new CampaignCommandError('VALIDATION', 400, 'Validation Error', message);
