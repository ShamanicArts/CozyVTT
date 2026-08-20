import express from 'express';
import session from 'express-session';
import request from 'supertest';

const assetFindUnique = jest.fn();
const assetDelete = jest.fn();
const assetUpdate = jest.fn();
const userFindUnique = jest.fn();
const membershipFindUnique = jest.fn();
const campaignFindUnique = jest.fn();
const deleteFile = jest.fn();

jest.mock('../../config/database', () => ({
  prisma: {
    asset: { findUnique: assetFindUnique, delete: assetDelete, update: assetUpdate },
    user: { findUnique: userFindUnique },
    campaignMembership: { findUnique: membershipFindUnique },
    campaign: { findUnique: campaignFindUnique },
  },
}));

jest.mock('../../middleware/compose', () => ({
  authenticated: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock('../../utils/fileUtils', () => ({
  ...jest.requireActual('../../utils/fileUtils'),
  deleteFile,
}));

import assetRoutes from '../assets';

const baseAsset = {
  id: 'asset-1', type: 'MAP', scope: 'USER', uploadedById: 'owner', campaignId: null,
  filename: 'map.png', originalName: 'Map.png', mimeType: 'image/png', fileSize: 10,
  filePath: 'uploads/map.png', thumbnailPath: 'uploads/thumb_map.png', name: 'Map',
  description: null, tags: [], createdAt: new Date('2025-01-01'),
};

function app(userId = 'owner', platformRole = 'USER'): express.Express {
  const server = express();
  server.use(express.json());
  server.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  server.use((req, _res, next) => {
    req.session.userId = userId;
    req.session.platformRole = platformRole as never;
    next();
  });
  server.use('/api/assets', assetRoutes);
  return server;
}

describe('asset HTTP adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    deleteFile.mockResolvedValue(true);
  });

  it('keeps delete response and best-effort filesystem contract through the asset command', async () => {
    assetFindUnique.mockResolvedValue(baseAsset);
    assetDelete.mockResolvedValue(baseAsset);

    const response = await request(app()).delete('/api/assets/asset-1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Asset deleted successfully' });
    expect(deleteFile).toHaveBeenCalledWith('uploads/map.png');
    expect(deleteFile).toHaveBeenCalledWith('uploads/thumb_map.png');
    expect(assetDelete).toHaveBeenCalledWith({ where: { id: 'asset-1' } });
  });

  it('preserves scope-change validation and command-backed persistence response', async () => {
    assetFindUnique.mockResolvedValue(baseAsset);
    campaignFindUnique.mockResolvedValue({ id: 'campaign-1' });
    membershipFindUnique.mockResolvedValue({ role: 'PLAYER' });
    assetUpdate.mockResolvedValue({
      ...baseAsset, scope: 'CAMPAIGN', campaignId: 'campaign-1',
      uploadedBy: { id: 'owner', displayName: 'Owner' }, campaign: { id: 'campaign-1', name: 'Briar Hall' },
    });

    const response = await request(app())
      .patch('/api/assets/asset-1/scope')
      .send({ scope: 'CAMPAIGN', campaignId: 'campaign-1' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ message: 'Asset scope updated successfully', asset: { scope: 'CAMPAIGN', campaignId: 'campaign-1' } });
    expect(assetUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'asset-1' }, data: { scope: 'CAMPAIGN', campaignId: 'campaign-1' },
    }));
  });
});
