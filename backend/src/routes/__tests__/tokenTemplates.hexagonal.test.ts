import express from 'express';
import session from 'express-session';
import request from 'supertest';

const create = jest.fn();

jest.mock('../../config/database', () => ({
  prisma: {
    tokenTemplate: { create },
  },
}));

jest.mock('../../middleware/compose', () => ({
  campaignMember: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  campaignDM: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

import tokenTemplateRoutes from '../tokenTemplates';

describe('token-template HTTP adapter', () => {
  it('keeps the create API contract while dispatching through the application command', async () => {
    create.mockResolvedValue({
      id: 'template-1',
      campaignId: 'campaign-1',
      createdById: 'user-1',
      name: 'Clockwork Owl',
      imageUrl: null,
      type: 'npc',
      disposition: 'friendly',
      displayMode: 'pog',
      size: { width: 1, height: 1 },
      notes: null,
      hp: { current: 3, max: 3, temp: 0 },
      showHpBar: true,
      statBlock: null,
      sightRadius: null,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    });

    const app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
    app.use((req, _res, next) => {
      req.session.userId = 'user-1';
      next();
    });
    app.use('/api/campaigns/:campaignId/token-templates', tokenTemplateRoutes);

    const response = await request(app)
      .post('/api/campaigns/campaign-1/token-templates')
      .send({
        name: 'Clockwork Owl',
        type: 'npc',
        disposition: 'friendly',
        displayMode: 'pog',
        size: { width: 1, height: 1 },
        hp: { current: 3, max: 3, temp: 0 },
        showHpBar: true,
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ id: 'template-1', campaignId: 'campaign-1', name: 'Clockwork Owl' });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        campaignId: 'campaign-1',
        createdById: 'user-1',
        name: 'Clockwork Owl',
        imageUrl: null,
        statBlock: expect.anything(),
      }),
    });
  });
});
