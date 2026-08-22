import { Prisma, PrismaClient } from '@prisma/client';
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
} from '../../domain/campaigns/Campaign';
import { CampaignAdministrationRepository } from '../../ports/CampaignAdministrationRepository';

/** Prisma adapter for the campaign administration command boundary. */
export class PrismaCampaignAdministrationRepository implements CampaignAdministrationRepository {
  constructor(private readonly client: PrismaClient) {}

  async createCampaign(data: { name: string; description: string; ownerId: string; vibeSettings: unknown; gameSystem: string | null }): Promise<CampaignRecord> {
    const campaign = await this.client.campaign.create({
      data: {
        ...data,
        gameSystem: data.gameSystem as Prisma.CampaignUncheckedCreateInput['gameSystem'],
        vibeSettings: data.vibeSettings as Prisma.InputJsonValue,
      },
    });
    return campaign as unknown as CampaignRecord;
  }

  async createMembership(data: { userId: string; campaignId: string; role: CampaignRole; characterIds: string[] }): Promise<CampaignMembershipRecord> {
    const membership = await this.client.campaignMembership.create({ data });
    return membership as unknown as CampaignMembershipRecord;
  }

  async findCampaignWithMemberships(campaignId: string): Promise<Record<string, unknown> | null> {
    const campaign = await this.client.campaign.findUnique({
      where: { id: campaignId },
      include: {
        memberships: {
          include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        },
      },
    });
    return campaign as unknown as Record<string, unknown> | null;
  }

  countCampaignCharacters(campaignId: string): Promise<number> {
    return this.client.character.count({ where: { campaignId } });
  }

  async updateCampaign(campaignId: string, data: CampaignUpdateData): Promise<CampaignRecord> {
    const campaign = await this.client.campaign.update({
      where: { id: campaignId },
      data: data as Prisma.CampaignUpdateInput,
    });
    return campaign as unknown as CampaignRecord;
  }

  async findCampaignVibe(campaignId: string): Promise<Pick<CampaignRecord, 'currentVibe'> | null> {
    const campaign = await this.client.campaign.findUnique({ where: { id: campaignId }, select: { currentVibe: true } });
    return campaign as Pick<CampaignRecord, 'currentVibe'> | null;
  }

  async updateCampaignVibe(campaignId: string, data: { vibeSettings: unknown; currentVibe?: null }): Promise<{ id: string; vibeSettings: unknown; currentVibe: string | null }> {
    const campaign = await this.client.campaign.update({
      where: { id: campaignId },
      data: { ...data, vibeSettings: data.vibeSettings as Prisma.InputJsonValue },
      select: { id: true, vibeSettings: true, currentVibe: true },
    });
    return campaign as unknown as { id: string; vibeSettings: unknown; currentVibe: string | null };
  }

  async findCampaignOwner(campaignId: string): Promise<{ ownerId: string } | null> {
    return this.client.campaign.findUnique({ where: { id: campaignId }, select: { ownerId: true } });
  }

  async rehomeCampaignAssets(campaignId: string): Promise<void> {
    await this.client.asset.updateMany({ where: { campaignId, scope: 'CAMPAIGN' }, data: { scope: 'USER', campaignId: null } });
  }

  async deleteCampaign(campaignId: string): Promise<void> {
    await this.client.capabilityApproval.updateMany({
      where: { campaignId, state: { in: ['PENDING', 'APPROVED'] } },
      data: { state: 'CANCELLED', cancelledAt: new Date(), cancellationReason: 'CAMPAIGN_DELETED' },
    });
    await this.client.campaign.delete({ where: { id: campaignId } });
  }

  async findUser(userId: string): Promise<CampaignUserRecord | null> {
    const user = await this.client.user.findUnique({ where: { id: userId } });
    return user as CampaignUserRecord | null;
  }

  async findMembership(userId: string, campaignId: string): Promise<CampaignMembershipRecord | null> {
    const membership = await this.client.campaignMembership.findUnique({ where: { userId_campaignId: { userId, campaignId } } });
    return membership as unknown as CampaignMembershipRecord | null;
  }

  async findInvitationForUserAndCampaign(userId: string, campaignId: string): Promise<CampaignInvitationRecord | null> {
    const invitation = await this.client.campaignInvitation.findUnique({ where: { userId_campaignId: { userId, campaignId } } });
    return invitation as unknown as CampaignInvitationRecord | null;
  }

  async findCampaignInvitationInfo(campaignId: string): Promise<{ name: string; description: string | null } | null> {
    return this.client.campaign.findUnique({ where: { id: campaignId }, select: { name: true, description: true } });
  }

  async findUserDisplayName(userId: string): Promise<string | null> {
    const user = await this.client.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    return user?.displayName ?? null;
  }

  async upsertPendingInvitation(data: { userId: string; campaignId: string; expiresAt: Date | null }): Promise<CampaignInvitationContext> {
    const invitation = await this.client.campaignInvitation.upsert({
      where: { userId_campaignId: { userId: data.userId, campaignId: data.campaignId } },
      create: { ...data, status: 'PENDING' },
      update: { status: 'PENDING', expiresAt: data.expiresAt, createdAt: new Date() },
      include: { campaign: { select: { id: true, name: true } } },
    });
    return invitation as unknown as CampaignInvitationContext;
  }

  async deleteMembership(userId: string, campaignId: string): Promise<void> {
    await this.client.capabilityApproval.updateMany({
      where: { delegatedUserId: userId, campaignId, state: { in: ['PENDING', 'APPROVED'] } },
      data: { state: 'CANCELLED', cancelledAt: new Date(), cancellationReason: 'MEMBERSHIP_REMOVED' },
    });
    await this.client.campaignMembership.delete({ where: { userId_campaignId: { userId, campaignId } } });
  }

  async findDungeonMaster(campaignId: string): Promise<CampaignMembershipRecord | null> {
    const membership = await this.client.campaignMembership.findFirst({ where: { campaignId, role: 'DM' } });
    return membership as unknown as CampaignMembershipRecord | null;
  }

  async updateMembershipRole(userId: string, campaignId: string, role: CampaignRole): Promise<CampaignMembershipRecord> {
    const membership = await this.client.campaignMembership.update({
      where: { userId_campaignId: { userId, campaignId } }, data: { role },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
    return membership as unknown as CampaignMembershipRecord;
  }

  async findInvitationWithCampaign(invitationId: string): Promise<InvitationWithCampaign | null> {
    const invitation = await this.client.campaignInvitation.findUnique({ where: { id: invitationId }, include: { campaign: true } });
    return invitation as unknown as InvitationWithCampaign | null;
  }

  async findInvitation(invitationId: string): Promise<CampaignInvitationRecord | null> {
    const invitation = await this.client.campaignInvitation.findUnique({ where: { id: invitationId } });
    return invitation as unknown as CampaignInvitationRecord | null;
  }

  async findCharactersForUser(characterIds: string[], userId: string): Promise<CampaignCharacterRecord[]> {
    const characters = await this.client.character.findMany({ where: { id: { in: characterIds }, userId } });
    return characters as unknown as CampaignCharacterRecord[];
  }

  async acceptInvitation(data: { invitationId: string; userId: string; campaignId: string; characterIds: string[] }): Promise<CampaignMembershipRecord> {
    return this.client.$transaction(async (tx) => {
      await tx.campaignInvitation.update({ where: { id: data.invitationId }, data: { status: 'ACCEPTED' } });
      const membership = await tx.campaignMembership.create({
        data: { userId: data.userId, campaignId: data.campaignId, role: 'PLAYER', characterIds: data.characterIds },
      });
      if (data.characterIds.length > 0) {
        await tx.character.updateMany({
          where: { id: { in: data.characterIds }, userId: data.userId }, data: { campaignId: data.campaignId },
        });
      }
      return membership as unknown as CampaignMembershipRecord;
    });
  }

  async updateInvitationStatus(invitationId: string, status: 'DECLINED'): Promise<void> {
    await this.client.campaignInvitation.update({ where: { id: invitationId }, data: { status } });
  }
}
