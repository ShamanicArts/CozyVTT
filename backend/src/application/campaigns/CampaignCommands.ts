import {
  CampaignCommandError,
  CampaignInvitationContext,
  CampaignMembershipRecord,
  CampaignRecord,
  CampaignRole,
  campaignValidationError,
  InvitationWithCampaign,
} from '../../domain/campaigns/Campaign';
import { CampaignAdministrationRepository } from '../../ports/CampaignAdministrationRepository';
import { DEFAULT_VIBE_SETTINGS, findVibePeriod, validateVibeSettings, VibeSettings } from '../../utils/vibe-presets';
import { Command, CommandHandler } from '../commands/CommandBus';

export const CREATE_CAMPAIGN = 'campaign.create' as const;
export const UPDATE_CAMPAIGN = 'campaign.update' as const;
export const UPDATE_CAMPAIGN_VIBE = 'campaign.vibe.update' as const;
export const DELETE_CAMPAIGN = 'campaign.delete' as const;
export const INVITE_TO_CAMPAIGN = 'campaign.invite' as const;
export const REMOVE_CAMPAIGN_MEMBER = 'campaign.member.remove' as const;
export const CHANGE_CAMPAIGN_MEMBER_ROLE = 'campaign.member.change-role' as const;
export const ACCEPT_CAMPAIGN_INVITATION = 'campaign.invitation.accept' as const;
export const DECLINE_CAMPAIGN_INVITATION = 'campaign.invitation.decline' as const;

export interface CreateCampaignCommand extends Command<{ campaign: Record<string, unknown> | null }> {
  readonly type: typeof CREATE_CAMPAIGN;
  readonly ownerId: string;
  readonly name: string;
  readonly description?: string;
  readonly gameSystem?: string | null;
}

export interface UpdateCampaignCommand extends Command<{ campaign: CampaignRecord; gameSystemCharacterCount?: number }> {
  readonly type: typeof UPDATE_CAMPAIGN;
  readonly campaignId: string;
  readonly input: Record<string, unknown>;
}

export interface UpdateCampaignVibeCommand extends Command<{ vibeSettings: unknown; currentVibe: string | null }> {
  readonly type: typeof UPDATE_CAMPAIGN_VIBE;
  readonly campaignId: string;
  readonly vibeSettings: unknown;
}

export interface DeleteCampaignCommand extends Command<void> {
  readonly type: typeof DELETE_CAMPAIGN;
  readonly campaignId: string;
  readonly requesterId: string;
  readonly platformRole: string;
}

export interface InviteToCampaignCommand extends Command<InviteToCampaignResult> {
  readonly type: typeof INVITE_TO_CAMPAIGN;
  readonly campaignId: string;
  readonly invitedBy: string;
  readonly userId: string | undefined;
  readonly expiresInDays: unknown;
}

export interface InviteToCampaignResult {
  invitation: CampaignInvitationContext;
  invitedUser: { email: string; displayName: string };
  campaign: { name: string; description: string | null };
  inviterDisplayName: string | null;
}

export interface RemoveCampaignMemberCommand extends Command<void> {
  readonly type: typeof REMOVE_CAMPAIGN_MEMBER;
  readonly campaignId: string;
  readonly userId: string;
}

export interface ChangeCampaignMemberRoleCommand extends Command<CampaignMembershipRecord> {
  readonly type: typeof CHANGE_CAMPAIGN_MEMBER_ROLE;
  readonly campaignId: string;
  readonly userId: string;
  readonly role: unknown;
}

export interface AcceptCampaignInvitationCommand extends Command<AcceptCampaignInvitationResult> {
  readonly type: typeof ACCEPT_CAMPAIGN_INVITATION;
  readonly invitationId: string;
  readonly userId: string;
  readonly characterIds: string[];
}

export interface AcceptCampaignInvitationResult {
  invitation: InvitationWithCampaign;
  membership: CampaignMembershipRecord;
}

export interface DeclineCampaignInvitationCommand extends Command<void> {
  readonly type: typeof DECLINE_CAMPAIGN_INVITATION;
  readonly invitationId: string;
  readonly userId: string;
}

export class CreateCampaign implements CommandHandler<CreateCampaignCommand, { campaign: Record<string, unknown> | null }> {
  constructor(private readonly repository: CampaignAdministrationRepository) {}

  async execute(command: CreateCampaignCommand): Promise<{ campaign: Record<string, unknown> | null }> {
    const campaign = await this.repository.createCampaign({
      name: command.name,
      description: command.description || '',
      ownerId: command.ownerId,
      vibeSettings: DEFAULT_VIBE_SETTINGS,
      gameSystem: command.gameSystem || null,
    });
    await this.repository.createMembership({ userId: command.ownerId, campaignId: campaign.id, role: 'DM', characterIds: [] });
    return { campaign: await this.repository.findCampaignWithMemberships(campaign.id) };
  }
}

export class UpdateCampaign implements CommandHandler<UpdateCampaignCommand, { campaign: CampaignRecord; gameSystemCharacterCount?: number }> {
  constructor(private readonly repository: CampaignAdministrationRepository) {}

  async execute(command: UpdateCampaignCommand): Promise<{ campaign: CampaignRecord; gameSystemCharacterCount?: number }> {
    const input = command.input;
    const updateData: Record<string, unknown> = {};
    for (const key of ['name', 'description', 'status', 'vibeSettings', 'spiritLayerEnabled', 'spiritLayerStyle', 'chatCooldownEnabled'] as const) {
      if (input[key] !== undefined) updateData[key] = input[key];
    }
    if (input.chatCooldownSeconds !== undefined) {
      const seconds = Number(input.chatCooldownSeconds);
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > 300) {
        throw campaignValidationError('chatCooldownSeconds must be an integer between 1 and 300');
      }
      updateData.chatCooldownSeconds = seconds;
    }

    let gameSystemCharacterCount: number | undefined;
    if (input.gameSystem !== undefined) {
      if (input.gameSystem !== null) {
        const validSystems = ['DND_5E', 'PATHFINDER_2E', 'SHADOWRUN_6E', 'CALL_OF_CTHULHU_7E'];
        if (!validSystems.includes(input.gameSystem as string)) {
          throw campaignValidationError(`Invalid game system. Must be one of: ${validSystems.join(', ')}`);
        }
      }
      gameSystemCharacterCount = await this.repository.countCampaignCharacters(command.campaignId);
      updateData.gameSystem = input.gameSystem;
    }

    const campaign = await this.repository.updateCampaign(command.campaignId, updateData);
    return gameSystemCharacterCount && gameSystemCharacterCount > 0
      ? { campaign, gameSystemCharacterCount }
      : { campaign };
  }
}

export class UpdateCampaignVibe implements CommandHandler<UpdateCampaignVibeCommand, { vibeSettings: unknown; currentVibe: string | null }> {
  constructor(private readonly repository: CampaignAdministrationRepository) {}

  async execute(command: UpdateCampaignVibeCommand): Promise<{ vibeSettings: unknown; currentVibe: string | null }> {
    if (!command.vibeSettings) throw campaignValidationError('vibeSettings is required');
    const validationError = validateVibeSettings(command.vibeSettings);
    if (validationError) throw campaignValidationError(validationError);

    const campaign = await this.repository.findCampaignVibe(command.campaignId);
    const updateData: { vibeSettings: unknown; currentVibe?: null } = { vibeSettings: command.vibeSettings };
    if (campaign?.currentVibe && !findVibePeriod(command.vibeSettings as VibeSettings, campaign.currentVibe)) {
      updateData.currentVibe = null;
    }
    const updated = await this.repository.updateCampaignVibe(command.campaignId, updateData);
    return { vibeSettings: updated.vibeSettings, currentVibe: updated.currentVibe };
  }
}

export class DeleteCampaign implements CommandHandler<DeleteCampaignCommand, void> {
  constructor(private readonly repository: CampaignAdministrationRepository) {}

  async execute(command: DeleteCampaignCommand): Promise<void> {
    const campaign = await this.repository.findCampaignOwner(command.campaignId);
    if (command.platformRole !== 'ADMIN' && campaign?.ownerId !== command.requesterId) {
      throw new CampaignCommandError('FORBIDDEN', 403, 'Forbidden', 'Only the campaign owner or admin can delete this campaign');
    }
    await this.repository.rehomeCampaignAssets(command.campaignId);
    await this.repository.deleteCampaign(command.campaignId);
  }
}

export class InviteToCampaign implements CommandHandler<InviteToCampaignCommand, InviteToCampaignResult> {
  constructor(private readonly repository: CampaignAdministrationRepository) {}

  async execute(command: InviteToCampaignCommand): Promise<InviteToCampaignResult> {
    if (!command.userId) throw campaignValidationError('User ID is required');

    const user = await this.repository.findUser(command.userId);
    if (!user) throw new CampaignCommandError('USER_NOT_FOUND', 404, 'Not Found', 'User not found');
    if (await this.repository.findMembership(command.userId, command.campaignId)) {
      throw new CampaignCommandError('ALREADY_MEMBER', 400, 'Bad Request', 'User is already a member of this campaign');
    }
    const existingInvitation = await this.repository.findInvitationForUserAndCampaign(command.userId, command.campaignId);
    if (existingInvitation?.status === 'PENDING') {
      throw new CampaignCommandError('PENDING_INVITATION', 400, 'Bad Request', 'User already has a pending invitation to this campaign');
    }

    let expiresAt: Date | null = null;
    if (command.expiresInDays && (command.expiresInDays as number) > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (command.expiresInDays as number));
    }
    const [campaign, inviterDisplayName] = await Promise.all([
      this.repository.findCampaignInvitationInfo(command.campaignId),
      this.repository.findUserDisplayName(command.invitedBy),
    ]);
    const invitation = await this.repository.upsertPendingInvitation({ userId: command.userId, campaignId: command.campaignId, expiresAt });
    return {
      invitation,
      invitedUser: { email: user.email, displayName: user.displayName },
      campaign: campaign!,
      inviterDisplayName,
    };
  }
}

export class RemoveCampaignMember implements CommandHandler<RemoveCampaignMemberCommand, void> {
  constructor(private readonly repository: CampaignAdministrationRepository) {}

  async execute(command: RemoveCampaignMemberCommand): Promise<void> {
    const membership = await this.repository.findMembership(command.userId, command.campaignId);
    if (!membership) throw new CampaignCommandError('MEMBER_NOT_FOUND', 404, 'Not Found', 'User is not a member of this campaign');
    if (membership.role === 'DM') {
      throw new CampaignCommandError('DM_MEMBER_PROTECTED', 400, 'Bad Request', 'Cannot remove the Dungeon Master from the campaign');
    }
    await this.repository.deleteMembership(command.userId, command.campaignId);
  }
}

export class ChangeCampaignMemberRole implements CommandHandler<ChangeCampaignMemberRoleCommand, CampaignMembershipRecord> {
  constructor(private readonly repository: CampaignAdministrationRepository) {}

  async execute(command: ChangeCampaignMemberRoleCommand): Promise<CampaignMembershipRecord> {
    if (!command.role || !['DM', 'PLAYER', 'SPECTATOR'].includes(command.role as string)) {
      throw campaignValidationError('Role must be DM, PLAYER, or SPECTATOR');
    }
    const membership = await this.repository.findMembership(command.userId, command.campaignId);
    if (!membership) throw new CampaignCommandError('MEMBER_NOT_FOUND', 404, 'Not Found', 'User is not a member of this campaign');
    if (membership.role === 'DM') {
      throw new CampaignCommandError('DM_MEMBER_PROTECTED', 400, 'Bad Request', "Cannot change the Dungeon Master's role");
    }
    if (command.role === 'DM' && await this.repository.findDungeonMaster(command.campaignId)) {
      throw new CampaignCommandError('DM_ALREADY_EXISTS', 400, 'Bad Request', 'Campaign already has a Dungeon Master. Only one DM per campaign is allowed.');
    }
    return this.repository.updateMembershipRole(command.userId, command.campaignId, command.role as CampaignRole);
  }
}

abstract class InvitationCommandBase {
  constructor(protected readonly repository: CampaignAdministrationRepository) {}

  protected requireOwnedPendingInvitation<T extends { userId: string; status: string }>(invitation: T | null, userId: string): T {
    if (!invitation) throw new CampaignCommandError('INVITATION_NOT_FOUND', 404, undefined, 'Invitation not found');
    if (invitation.userId !== userId) throw new CampaignCommandError('INVITATION_UNAUTHORIZED', 403, undefined, 'Not authorized');
    if (invitation.status !== 'PENDING') throw new CampaignCommandError('INVITATION_PROCESSED', 400, undefined, 'Invitation already processed');
    return invitation;
  }
}

export class AcceptCampaignInvitation extends InvitationCommandBase implements CommandHandler<AcceptCampaignInvitationCommand, AcceptCampaignInvitationResult> {
  async execute(command: AcceptCampaignInvitationCommand): Promise<AcceptCampaignInvitationResult> {
    const invitation = this.requireOwnedPendingInvitation(
      await this.repository.findInvitationWithCampaign(command.invitationId), command.userId
    );
    if (invitation.expiresAt && new Date() > invitation.expiresAt) {
      throw new CampaignCommandError('INVITATION_EXPIRED', 400, undefined, 'Invitation expired');
    }

    if (command.characterIds.length > 0) {
      const characters = await this.repository.findCharactersForUser(command.characterIds, command.userId);
      if (characters.length !== command.characterIds.length) {
        throw new CampaignCommandError('INVALID_CHARACTER_SELECTION', 400, undefined, 'Invalid character selection');
      }
      const assigned = characters.find((character) => character.campaignId !== null);
      if (assigned) {
        throw new CampaignCommandError('CHARACTER_ASSIGNED', 400, undefined, `Character "${assigned.name}" is already assigned to a campaign`);
      }
      if (invitation.campaign.gameSystem) {
        const incompatible = characters.find((character) => character.gameSystem && character.gameSystem !== invitation.campaign.gameSystem);
        if (incompatible) {
          throw new CampaignCommandError('CHARACTER_INCOMPATIBLE', 400, undefined, `Character "${incompatible.name}" is not compatible with campaign game system`);
        }
      }
    }
    const membership = await this.repository.acceptInvitation({
      invitationId: command.invitationId, userId: command.userId, campaignId: invitation.campaignId, characterIds: command.characterIds,
    });
    return { invitation, membership };
  }
}

export class DeclineCampaignInvitation extends InvitationCommandBase implements CommandHandler<DeclineCampaignInvitationCommand, void> {
  async execute(command: DeclineCampaignInvitationCommand): Promise<void> {
    this.requireOwnedPendingInvitation(await this.repository.findInvitation(command.invitationId), command.userId);
    await this.repository.updateInvitationStatus(command.invitationId, 'DECLINED');
  }
}

/** Narrow helper for HTTP adapters that preserve their established error shapes. */
export function isCampaignCommandError(error: unknown): error is CampaignCommandError {
  return error instanceof CampaignCommandError;
}
