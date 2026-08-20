import express from 'express';
import session from 'express-session';
import request from 'supertest';

const create = jest.fn();
const findUnique = jest.fn();
const update = jest.fn();
const remove = jest.fn();
const findCampaign = jest.fn();
const findMembership = jest.fn();
const updateMembership = jest.fn();
const broadcastToCampaign = jest.fn();

jest.mock('../../config/database', () => ({
  prisma: {
    character: { create, findUnique, update, delete: remove },
    campaign: { findUnique: findCampaign },
    campaignMembership: { findUnique: findMembership, update: updateMembership },
  },
}));

jest.mock('../../middleware/compose', () => ({
  authenticated: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock('../../websocket/utils', () => ({ broadcastToCampaign }));

import characterRoutes from '../characters';

const userId = 'user-1';
const characterId = 'character-1';
const campaignId = 'campaign-1';
let currentCharacter: Record<string, unknown>;

function resetData(): void {
  currentCharacter = {
    id: characterId, userId, name: 'Mira', data: {}, tokenImageUrl: null,
    gameSystem: null, campaignId: null,
  };
  findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === characterId ? currentCharacter : null,
  );
  create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: characterId, ...data }));
  update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    currentCharacter = { ...currentCharacter, ...data };
    return currentCharacter;
  });
  remove.mockResolvedValue(undefined);
  findCampaign.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === campaignId ? { id: campaignId, name: 'Briar Hall', gameSystem: null } : null,
  );
  findMembership.mockResolvedValue({ role: 'PLAYER', characterIds: [] });
  updateMembership.mockResolvedValue(undefined);
}

function app(): express.Express {
  const server = express();
  server.use(express.json());
  server.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  server.use((req, _res, next) => {
    req.session.userId = userId;
    next();
  });
  server.use('/api/characters', characterRoutes);
  return server;
}

describe('character HTTP command adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetData();
  });

  it('preserves create, update, assignment, copy, and delete contracts', async () => {
    const server = app();
    const created = await request(server).post('/api/characters').send({ name: 'Mira' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ message: 'Character created successfully', character: { id: characterId, name: 'Mira', data: {} } });

    const updated = await request(server).put(`/api/characters/${characterId}`).send({ name: 'Mira Vale' });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ message: 'Character updated successfully', character: { name: 'Mira Vale' } });

    const assigned = await request(server).post(`/api/characters/${characterId}/assign`).send({ campaignId });
    expect(assigned.status).toBe(200);
    expect(assigned.body.message).toBe('Character assigned to campaign successfully');
    expect(broadcastToCampaign).toHaveBeenCalledWith(campaignId, 'roster.updated', expect.objectContaining({ action: 'character.assigned', characterId, userId, campaignId }));

    const copied = await request(server).post(`/api/characters/${characterId}/copy`).send({});
    expect(copied.status).toBe(201);
    expect(copied.body).toMatchObject({ message: 'Character copied successfully', character: { name: 'Mira Vale (Copy)', campaignId: null } });

    const deleted = await request(server).delete(`/api/characters/${characterId}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ message: 'Character deleted successfully' });
  });

  it('keeps validation and ownership errors unchanged', async () => {
    const server = app();
    const invalid = await request(server).post('/api/characters').send({ name: '' });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ error: 'Validation Error', message: 'Character name is required' });

    currentCharacter = { ...currentCharacter, userId: 'another-user' };
    const denied = await request(server).delete(`/api/characters/${characterId}`);
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({ error: 'Forbidden', message: 'Only the character owner can delete this character' });
  });
});
