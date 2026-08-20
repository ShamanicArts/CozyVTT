import express from 'express';
import request from 'supertest';

const mockMapCreate = jest.fn();
const mockMapFindUnique = jest.fn();
const mockMapUpdate = jest.fn();
const mockMapDelete = jest.fn();
const mockCampaignFindUnique = jest.fn();
const mockCampaignUpdate = jest.fn();
const mockBroadcastToCampaign = jest.fn();

jest.mock('../../config/database', () => ({
  prisma: {
    map: { create: mockMapCreate, findUnique: mockMapFindUnique, update: mockMapUpdate, delete: mockMapDelete },
    campaign: { findUnique: mockCampaignFindUnique, update: mockCampaignUpdate },
  },
}));

jest.mock('../../middleware/compose', () => ({
  campaignMember: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  campaignDM: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock('../../websocket/utils', () => ({ broadcastToCampaign: mockBroadcastToCampaign }));

import mapRoutes from '../maps';

const baseMap = {
  id: 'map-1', campaignId: 'campaign-1', name: 'Briar Hollow', imageUrl: '/api/assets/maps/asset-1',
  baseLayerUrl: '/api/assets/maps/asset-1', width: 30, height: 20, gridSize: 50, feetPerSquare: 5,
  diagonalRule: 'flat', spiritLayerUrl: null, tokens: [], annotations: [], wallSegments: [], fogData: null,
  lightingEnabled: false, lights: [], createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-01'),
};

function app(): express.Express {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/campaigns/:campaignId/maps', mapRoutes);
  return instance;
}

beforeEach(() => jest.resetAllMocks());

describe('map lifecycle HTTP adapter', () => {
  it('keeps create status, response shape, defaults, and map asset normalization', async () => {
    mockMapCreate.mockResolvedValue(baseMap);
    const response = await request(app()).post('/api/campaigns/campaign-1/maps').send({
      name: '  Briar Hollow  ', imageUrl: 'asset-1', width: 30, height: 20,
    });

    expect(response.status).toBe(201);
    expect(response.body.map).toMatchObject({ id: 'map-1', imageUrl: '/api/assets/maps/asset-1' });
    expect(mockMapCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'Briar Hollow', gridSize: 50, feetPerSquare: 5, diagonalRule: 'flat' }),
    }));
  });

  it('returns the original not-found response before validating a malformed update', async () => {
    mockMapFindUnique.mockResolvedValue(null);
    const response = await request(app()).put('/api/campaigns/campaign-1/maps/missing').send({ width: -1 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not Found', message: 'Map not found' });
    expect(mockMapUpdate).not.toHaveBeenCalled();
  });

  it('routes generic lighting edits through the scene-lighting persistence path before broadcasting', async () => {
    mockMapFindUnique.mockResolvedValue(baseMap);
    mockMapUpdate.mockResolvedValue({ ...baseMap, lightingEnabled: true });
    const response = await request(app()).put('/api/campaigns/campaign-1/maps/map-1').send({ lightingEnabled: true });

    expect(response.status).toBe(200);
    expect(response.body.map.lightingEnabled).toBe(true);
    // MapCoreRepository intentionally does no generic map update for a
    // lighting-only edit; this is the SceneMutationRepository write shape.
    expect(mockMapUpdate).toHaveBeenCalledTimes(1);
    expect(mockMapUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { lightingEnabled: true } }));
    expect(mockBroadcastToCampaign).toHaveBeenCalledWith('campaign-1', 'map:lighting:updated', {
      mapId: 'map-1', lightingEnabled: true,
    });
  });

  it('keeps current-map deletion protection and its response contract', async () => {
    mockMapFindUnique.mockResolvedValue(baseMap);
    mockCampaignFindUnique.mockResolvedValue({ currentMapId: 'map-1' });
    const response = await request(app()).delete('/api/campaigns/campaign-1/maps/map-1');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Validation Error', message: 'Cannot delete the current map. Set a different map as current first.',
    });
    expect(mockMapDelete).not.toHaveBeenCalled();
  });

  it('keeps set-current response payloads intact', async () => {
    mockMapFindUnique.mockResolvedValue(baseMap);
    const campaign = { id: 'campaign-1', currentMapId: 'map-1', currentMap: { id: 'map-1', name: 'Briar Hollow', imageUrl: '/api/assets/maps/asset-1' } };
    mockCampaignUpdate.mockResolvedValue(campaign);
    const response = await request(app()).put('/api/campaigns/campaign-1/maps/map-1/set-current');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Current map updated successfully', campaign });
    expect(mockCampaignUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { currentMapId: 'map-1' } }));
  });
});
