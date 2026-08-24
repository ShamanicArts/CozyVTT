import {
  ACCEPT_CAMPAIGN_INVITATION,
  CHANGE_CAMPAIGN_MEMBER_ROLE,
  CREATE_CAMPAIGN,
  DECLINE_CAMPAIGN_INVITATION,
  DELETE_CAMPAIGN,
  INVITE_TO_CAMPAIGN,
  UPDATE_CAMPAIGN,
  UPDATE_CAMPAIGN_VIBE,
  SET_CAMPAIGN_PRESENTATION,
  AcceptCampaignInvitation,
  ChangeCampaignMemberRole,
  CreateCampaign,
  DeclineCampaignInvitation,
  DeleteCampaign,
  InviteToCampaign,
  UpdateCampaign,
  UpdateCampaignVibe,
  SetCampaignPresentation,
} from './CampaignCommands';
import { CampaignCommandError, CampaignRecord, InvitationCampaignRecord } from '../../domain/campaigns/Campaign';
import { CampaignAdministrationRepository } from '../../ports/CampaignAdministrationRepository';

const campaign = (overrides: Partial<CampaignRecord> = {}): CampaignRecord => ({
  id: 'campaign-1', ownerId: 'owner-1', currentVibe: 'dawn', gameSystem: 'DND_5E', activePresentationId: 'cozyvtt.core.map-2d', ...overrides,
});

const invitationCampaign = (overrides: Partial<InvitationCampaignRecord> = {}): InvitationCampaignRecord => ({
  ...campaign(), name: 'Briar Hollow', description: 'A mystery', ...overrides,
});

function repository(): jest.Mocked<CampaignAdministrationRepository> {
  return {
    createCampaign: jest.fn(),
    createMembership: jest.fn(),
    findCampaignWithMemberships: jest.fn(),
    countCampaignCharacters: jest.fn(),
    updateCampaign: jest.fn(),
    findCampaignVibe: jest.fn(),
    updateCampaignVibe: jest.fn(),
    setActivePresentation: jest.fn(),
    findCampaignOwner: jest.fn(),
    rehomeCampaignAssets: jest.fn(),
    deleteCampaign: jest.fn(),
    findUser: jest.fn(),
    findMembership: jest.fn(),
    findInvitationForUserAndCampaign: jest.fn(),
    findCampaignInvitationInfo: jest.fn(),
    findUserDisplayName: jest.fn(),
    upsertPendingInvitation: jest.fn(),
    deleteMembership: jest.fn(),
    findDungeonMaster: jest.fn(),
    updateMembershipRole: jest.fn(),
    findInvitationWithCampaign: jest.fn(),
    findInvitation: jest.fn(),
    findCharactersForUser: jest.fn(),
    acceptInvitation: jest.fn(),
    updateInvitationStatus: jest.fn(),
  };
}

describe('campaign administration commands', () => {
  it('creates the owner membership before reading the exact member-safe campaign response', async () => {
    const store = repository();
    store.createCampaign.mockResolvedValue(campaign());
    store.findCampaignWithMemberships.mockResolvedValue({ id: 'campaign-1', memberships: [] });

    const result = await new CreateCampaign(store).execute({
      type: CREATE_CAMPAIGN, ownerId: 'owner-1', name: 'Briar Hollow', description: undefined, gameSystem: null,
    });

    expect(store.createCampaign).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Briar Hollow', description: '', ownerId: 'owner-1', gameSystem: null,
    }));
    expect(store.createMembership).toHaveBeenCalledWith({ userId: 'owner-1', campaignId: 'campaign-1', role: 'DM', characterIds: [] });
    expect(result.campaign).toEqual({ id: 'campaign-1', memberships: [] });
  });

  it('preserves update validation while surfacing the existing-character warning as data for the HTTP adapter', async () => {
    const store = repository();
    store.countCampaignCharacters.mockResolvedValue(2);
    store.updateCampaign.mockResolvedValue(campaign({ gameSystem: 'PATHFINDER_2E' }));

    const result = await new UpdateCampaign(store).execute({
      type: UPDATE_CAMPAIGN, campaignId: 'campaign-1', input: { gameSystem: 'PATHFINDER_2E', chatCooldownSeconds: '12' },
    });

    expect(store.updateCampaign).toHaveBeenCalledWith('campaign-1', { gameSystem: 'PATHFINDER_2E', chatCooldownSeconds: 12 });
    expect(result.gameSystemCharacterCount).toBe(2);
  });

  it('rejects invalid chat cooldowns before persistence', async () => {
    const store = repository();
    await expect(new UpdateCampaign(store).execute({
      type: UPDATE_CAMPAIGN, campaignId: 'campaign-1', input: { chatCooldownSeconds: 301 },
    })).rejects.toEqual(new CampaignCommandError('VALIDATION', 400, 'Validation Error', 'chatCooldownSeconds must be an integer between 1 and 300'));
    expect(store.updateCampaign).not.toHaveBeenCalled();
  });

  it('resets a removed current vibe before persisting the validated settings', async () => {
    const store = repository();
    store.findCampaignVibe.mockResolvedValue({ currentVibe: 'dawn' });
    store.updateCampaignVibe.mockResolvedValue({ id: 'campaign-1', currentVibe: null, vibeSettings: { enabled: true, periods: [{ name: 'night', hue: '#1A1A2E', filter: '', audio: null }] } });
    const vibeSettings = { enabled: true, periods: [{ name: 'night', hue: '#1A1A2E', filter: '', audio: null }] };

    await new UpdateCampaignVibe(store).execute({ type: UPDATE_CAMPAIGN_VIBE, campaignId: 'campaign-1', vibeSettings });

    expect(store.updateCampaignVibe).toHaveBeenCalledWith('campaign-1', { vibeSettings, currentVibe: null });
  });

  it('persists a validated campaign presentation without changing map state', async () => {
    const store = repository();
    store.setActivePresentation.mockResolvedValue({
      activePresentationId: 'com.cozyvtt.three-map.three-map',
    });

    const result = await new SetCampaignPresentation(store).execute({
      type: SET_CAMPAIGN_PRESENTATION,
      campaignId: 'campaign-1',
      activePresentationId: 'com.cozyvtt.three-map.three-map',
    });

    expect(store.setActivePresentation).toHaveBeenCalledWith(
      'campaign-1',
      'com.cozyvtt.three-map.three-map',
    );
    expect(result.activePresentationId).toBe(
      'com.cozyvtt.three-map.three-map',
    );
  });

  it('rejects malformed campaign presentation IDs before persistence', async () => {
    const store = repository();
    await expect(
      new SetCampaignPresentation(store).execute({
        type: SET_CAMPAIGN_PRESENTATION,
        campaignId: 'campaign-1',
        activePresentationId: '../unsafe',
      }),
    ).rejects.toEqual(
      new CampaignCommandError(
        'VALIDATION',
        400,
        'Validation Error',
        'Invalid campaign presentation ID',
      ),
    );
    expect(store.setActivePresentation).not.toHaveBeenCalled();
  });

  it('re-homes campaign assets before deleting an owner-authorized campaign', async () => {
    const store = repository();
    store.findCampaignOwner.mockResolvedValue({ ownerId: 'owner-1' });
    await new DeleteCampaign(store).execute({
      type: DELETE_CAMPAIGN, campaignId: 'campaign-1', requesterId: 'owner-1', platformRole: 'USER',
    });
    expect(store.rehomeCampaignAssets.mock.invocationCallOrder[0]).toBeLessThan(store.deleteCampaign.mock.invocationCallOrder[0]);
  });

  it('creates an invitation only after membership and pending-invitation checks', async () => {
    const store = repository();
    store.findUser.mockResolvedValue({ id: 'player-1', email: 'player@example.test', displayName: 'Player' });
    store.findMembership.mockResolvedValue(null);
    store.findInvitationForUserAndCampaign.mockResolvedValue(null);
    store.findCampaignInvitationInfo.mockResolvedValue({ name: 'Briar Hollow', description: 'A mystery' });
    store.findUserDisplayName.mockResolvedValue('DM');
    store.upsertPendingInvitation.mockResolvedValue({
      invitation: { id: 'invite-1', userId: 'player-1', campaignId: 'campaign-1', status: 'PENDING', expiresAt: null },
      campaign: { id: 'campaign-1', name: 'Briar Hollow' },
    });

    const result = await new InviteToCampaign(store, {
      notify: jest.fn(async () => undefined),
    }).execute({
      type: INVITE_TO_CAMPAIGN, campaignId: 'campaign-1', invitedBy: 'owner-1', userId: 'player-1', expiresInDays: undefined,
    });

    expect(store.upsertPendingInvitation).toHaveBeenCalledWith({ userId: 'player-1', campaignId: 'campaign-1', expiresAt: null });
    expect(result.invitedUser.email).toBe('player@example.test');
  });

  it('keeps the one-DM guard before a role change', async () => {
    const store = repository();
    store.findMembership.mockResolvedValue({ userId: 'player-1', campaignId: 'campaign-1', role: 'PLAYER', characterIds: [] });
    store.findDungeonMaster.mockResolvedValue({ userId: 'owner-1', campaignId: 'campaign-1', role: 'DM', characterIds: [] });

    await expect(new ChangeCampaignMemberRole(store).execute({
      type: CHANGE_CAMPAIGN_MEMBER_ROLE, campaignId: 'campaign-1', userId: 'player-1', role: 'DM',
    })).rejects.toEqual(new CampaignCommandError('DM_ALREADY_EXISTS', 400, 'Bad Request', 'Campaign already has a Dungeon Master. Only one DM per campaign is allowed.'));
    expect(store.updateMembershipRole).not.toHaveBeenCalled();
  });

  it('accepts an owned invitation only after character ownership and campaign compatibility checks', async () => {
    const store = repository();
    store.findInvitationWithCampaign.mockResolvedValue({
      id: 'invite-1', userId: 'player-1', campaignId: 'campaign-1', status: 'PENDING', expiresAt: null,
      campaign: invitationCampaign(),
    });
    store.findCharactersForUser.mockResolvedValue([{ id: 'character-1', name: 'Moss', campaignId: null, gameSystem: 'DND_5E' }]);
    store.acceptInvitation.mockResolvedValue({ userId: 'player-1', campaignId: 'campaign-1', role: 'PLAYER', characterIds: ['character-1'] });

    const result = await new AcceptCampaignInvitation(store).execute({
      type: ACCEPT_CAMPAIGN_INVITATION, invitationId: 'invite-1', userId: 'player-1', characterIds: ['character-1'],
    });

    expect(store.acceptInvitation).toHaveBeenCalledWith({ invitationId: 'invite-1', userId: 'player-1', campaignId: 'campaign-1', characterIds: ['character-1'] });
    expect(result.membership.role).toBe('PLAYER');
  });

  it('does not decline an invitation owned by another user', async () => {
    const store = repository();
    store.findInvitation.mockResolvedValue({
      id: 'invite-1', userId: 'other-user', campaignId: 'campaign-1', status: 'PENDING', expiresAt: null,
      campaign: invitationCampaign(),
    });

    await expect(new DeclineCampaignInvitation(store).execute({
      type: DECLINE_CAMPAIGN_INVITATION, invitationId: 'invite-1', userId: 'player-1',
    })).rejects.toEqual(new CampaignCommandError('INVITATION_UNAUTHORIZED', 403, undefined, 'Not authorized'));
    expect(store.updateInvitationStatus).not.toHaveBeenCalled();
  });
});
