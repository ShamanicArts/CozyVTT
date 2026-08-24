import express from 'express';
import request from 'supertest';

const mockInvitationFindUnique = jest.fn();
const mockInvitationUpdate = jest.fn();

jest.mock('../../config/database', () => ({
  prisma: {
    campaignInvitation: { findUnique: mockInvitationFindUnique, update: mockInvitationUpdate, findMany: jest.fn() },
    character: { findMany: jest.fn(), updateMany: jest.fn() },
    campaignMembership: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../middleware/compose', () => ({
  authenticated: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.session = { userId: 'player-1' } as express.Request["session"];
    next();
  },
}));

jest.mock('../../websocket/utils', () => ({ broadcastToCampaign: jest.fn() }));

import invitationRoutes from '../invitations';

function app(): express.Express {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/invitations', invitationRoutes);
  return instance;
}

beforeEach(() => jest.resetAllMocks());

describe('campaign invitation HTTP adapter', () => {
  it('keeps accept not-found response shape through the command boundary', async () => {
    mockInvitationFindUnique.mockResolvedValue(null);
    const response = await request(app()).post('/api/invitations/missing/accept').send({ characterIds: [] });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Invitation not found' });
  });

  it('keeps decline ownership and pending-state checks before persistence', async () => {
    mockInvitationFindUnique.mockResolvedValue({
      id: 'invite-1', userId: 'other-user', campaignId: 'campaign-1', status: 'PENDING', expiresAt: null,
    });
    const response = await request(app()).post('/api/invitations/invite-1/decline');
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ message: 'Not authorized' });
    expect(mockInvitationUpdate).not.toHaveBeenCalled();
  });
});
