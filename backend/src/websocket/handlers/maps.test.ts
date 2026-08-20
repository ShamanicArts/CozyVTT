const mockFindUnique = jest.fn();
const mockGetSpiritVisibilityBatch = jest.fn();
const mockFilterMapData = jest.fn();

jest.mock('../../config/database', () => ({ prisma: { map: { findUnique: mockFindUnique } } }));
jest.mock('../../utils/spirit-layer', () => ({
  getSpiritVisibilityBatch: mockGetSpiritVisibilityBatch,
  filterMapData: mockFilterMapData,
}));

import { registerMapHandlers } from './maps';

function socketFor(overrides: Record<string, unknown> = {}) {
  const handlers = new Map<string, (data: any) => Promise<void>>();
  return {
    id: 'socket-1', campaignId: 'campaign-1', role: 'DM', userId: 'user-1',
    on: jest.fn((event: string, handler: (data: any) => Promise<void>) => handlers.set(event, handler)),
    emit: jest.fn(),
    handlers,
    ...overrides,
  };
}

function ioFor(recipients: Array<Record<string, unknown>>) {
  return {
    in: jest.fn(() => ({ fetchSockets: jest.fn(async () => recipients) })),
  };
}

beforeEach(() => jest.resetAllMocks());

describe('map.change Socket.IO adapter', () => {
  it('keeps foreign-map failures indistinguishable from missing maps', async () => {
    mockFindUnique.mockResolvedValue({ id: 'map-1', campaignId: 'other-campaign' });
    const socket = socketFor();
    registerMapHandlers(ioFor([]) as any, socket as any);

    await socket.handlers.get('map.change')!({ mapId: 'map-1' });

    expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Map not found' });
  });

  it('preserves recipient-specific filtered map broadcasts', async () => {
    const map = { id: 'map-1', campaignId: 'campaign-1', tokens: [], annotations: [] };
    mockFindUnique.mockResolvedValue(map);
    mockGetSpiritVisibilityBatch.mockResolvedValue(new Map([['player-1', true]]));
    mockFilterMapData.mockImplementation((input: unknown, role: string) => ({ input, role }));
    const dmRecipient = { role: 'DM', userId: 'dm-1', emit: jest.fn() };
    const playerRecipient = { role: 'PLAYER', userId: 'player-1', emit: jest.fn() };
    const socket = socketFor();
    registerMapHandlers(ioFor([dmRecipient, playerRecipient]) as any, socket as any);

    await socket.handlers.get('map.change')!({ mapId: 'map-1' });

    expect(dmRecipient.emit).toHaveBeenCalledWith('map.changed', expect.objectContaining({ mapId: 'map-1', spiritVisible: true }));
    expect(playerRecipient.emit).toHaveBeenCalledWith('map.changed', expect.objectContaining({ mapId: 'map-1', spiritVisible: true }));
    expect(mockFilterMapData).toHaveBeenCalledTimes(2);
  });
});
