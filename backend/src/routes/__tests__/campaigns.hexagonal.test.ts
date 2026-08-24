import express from 'express';
import request from 'supertest';

const mockCampaignCreate = jest.fn();
const mockCampaignFindUnique = jest.fn();
const mockCampaignUpdate = jest.fn();
const mockCharacterCount = jest.fn();
const mockMembershipCreate = jest.fn();
const mockMembershipFindUnique = jest.fn();
const mockMembershipFindFirst = jest.fn();
const mockMembershipUpdate = jest.fn();
const mockMembershipDelete = jest.fn();
const mockInvitationFindUnique = jest.fn();
const mockInvitationUpsert = jest.fn();
const mockUserFindUnique = jest.fn();
const mockAssetUpdateMany = jest.fn();

jest.mock('../../config/database', () => ({
  prisma: {
    campaign: { create: mockCampaignCreate, findUnique: mockCampaignFindUnique, update: mockCampaignUpdate, delete: jest.fn() },
    character: { count: mockCharacterCount },
    campaignMembership: {
      create: mockMembershipCreate, findUnique: mockMembershipFindUnique, findFirst: mockMembershipFindFirst,
      update: mockMembershipUpdate, delete: mockMembershipDelete, findMany: jest.fn(),
    },
    campaignInvitation: { findUnique: mockInvitationFindUnique, upsert: mockInvitationUpsert, findMany: jest.fn() },
    user: { findUnique: mockUserFindUnique, findMany: jest.fn() },
    asset: { updateMany: mockAssetUpdateMany },
  },
}));

jest.mock('../../middleware/compose', () => {
  const permit = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.session = {
      userId: 'owner-1',
      platformRole: 'USER',
    } as express.Request["session"];
    next();
  };
  return { authenticated: permit, campaignMember: permit, campaignDM: permit, adminOnly: permit };
});

jest.mock('../../services/email', () => ({ isSmtpConfigured: () => false, sendCampaignInvitationEmail: jest.fn() }));
jest.mock('../../websocket/utils', () => ({ broadcastToUser: jest.fn(), broadcastToCampaign: jest.fn(), sendSystemMessage: jest.fn() }));

import campaignRoutes from '../campaigns';

function app(): express.Express {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/campaigns', campaignRoutes);
  return instance;
}

beforeEach(() => jest.resetAllMocks());

describe('campaign administration HTTP adapter', () => {
  it('keeps campaign creation status and member-safe response shape through the command bus', async () => {
    const created = { id: 'campaign-1', ownerId: 'owner-1', name: 'Briar Hollow', currentVibe: null, gameSystem: null };
    const responseCampaign = { ...created, memberships: [{ user: { id: 'owner-1', displayName: 'DM', avatarUrl: null } }] };
    mockCampaignCreate.mockResolvedValue(created);
    mockMembershipCreate.mockResolvedValue({});
    mockCampaignFindUnique.mockResolvedValue(responseCampaign);

    const response = await request(app()).post('/api/campaigns').send({ name: 'Briar Hollow' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ message: 'Campaign created successfully', campaign: responseCampaign });
    expect(mockMembershipCreate).toHaveBeenCalledWith({ data: { userId: 'owner-1', campaignId: 'campaign-1', role: 'DM', characterIds: [] } });
  });

  it('keeps update validation response shape without writing', async () => {
    const response = await request(app()).put('/api/campaigns/campaign-1').send({ chatCooldownSeconds: 301 });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Validation Error', message: 'chatCooldownSeconds must be an integer between 1 and 300' });
    expect(mockCampaignUpdate).not.toHaveBeenCalled();
  });

  it('keeps the invitation missing-user validation before persistence or notification', async () => {
    const response = await request(app()).post('/api/campaigns/campaign-1/invite').send({});
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Validation Error', message: 'User ID is required' });
    expect(mockInvitationUpsert).not.toHaveBeenCalled();
  });

  it('keeps one-DM role protection response intact', async () => {
    mockMembershipFindUnique.mockResolvedValue({ userId: 'player-1', campaignId: 'campaign-1', role: 'PLAYER', characterIds: [] });
    mockMembershipFindFirst.mockResolvedValue({ userId: 'owner-1', campaignId: 'campaign-1', role: 'DM', characterIds: [] });

    const response = await request(app()).put('/api/campaigns/campaign-1/members/player-1/role').send({ role: 'DM' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Bad Request', message: 'Campaign already has a Dungeon Master. Only one DM per campaign is allowed.' });
    expect(mockMembershipUpdate).not.toHaveBeenCalled();
  });
});
