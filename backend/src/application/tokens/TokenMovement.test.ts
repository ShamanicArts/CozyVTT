import {
  FinalizeTokenMove,
  FinalizeTokenMoveCommand,
  PreviewTokenMove,
  StartTokenMove,
} from './TokenMovement';
import { MapToken, TokenMovementMap } from '../../domain/tokens/TokenMovement';
import { SpiritVisibilityPolicy } from '../../ports/SpiritVisibilityPolicy';
import { TokenMovementRepository } from '../../ports/TokenMovementRepository';

const token: MapToken = {
  id: 'token-1',
  name: 'Mira',
  imageUrl: '/mira.png',
  position: { x: 3, y: 4 },
  size: { width: 1, height: 1 },
  layer: 'token',
  visible: true,
  controlledBy: 'player-1',
  rotation: 0,
  conditions: [],
  metadata: {},
};

function mapWith(tokens: MapToken[] = [token]): TokenMovementMap {
  return {
    id: 'map-1',
    campaignId: 'campaign-1',
    width: 30,
    height: 20,
    gridSize: 50,
    tokens,
    lightingEnabled: false,
    wallSegments: [],
    lights: [],
  };
}

function makeRepository(map: TokenMovementMap | null = mapWith()): TokenMovementRepository {
  return {
    findMap: jest.fn(async () => map),
    updateTokens: jest.fn(async () => undefined),
  };
}

const visibleSpirit: SpiritVisibilityPolicy = {
  canSeeSpiritLayer: jest.fn(async () => true),
};

const playerCommand = (overrides: Partial<FinalizeTokenMoveCommand> = {}): FinalizeTokenMoveCommand => ({
  type: 'token.move.finalize',
  actor: { campaignId: 'campaign-1', userId: 'player-1', role: 'PLAYER' },
  tokenId: 'token-1',
  mapId: 'map-1',
  position: { x: 8, y: 9 },
  ...overrides,
});

describe('token movement application commands', () => {
  it('authorizes and persists the final position through the token repository', async () => {
    const repository = makeRepository();
    const result = await new FinalizeTokenMove(repository, visibleSpirit).execute(playerCommand());

    expect(result.token.position).toEqual({ x: 8, y: 9 });
    expect(result.tokens[0].position).toEqual({ x: 8, y: 9 });
    expect(repository.updateTokens).toHaveBeenCalledWith('map-1', result.tokens);
  });

  it('preserves the movement permission failure before it writes', async () => {
    const repository = makeRepository();
    await expect(new FinalizeTokenMove(repository, visibleSpirit).execute(playerCommand({
      actor: { campaignId: 'campaign-1', userId: 'other-player', role: 'PLAYER' },
    }))).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
      message: 'You do not have permission to move this token',
    });
    expect(repository.updateTokens).not.toHaveBeenCalled();
  });

  it('retains the legacy spectator-specific error when the spectator controls the token', async () => {
    const repository = makeRepository();
    await expect(new StartTokenMove(repository, visibleSpirit).execute({
      type: 'token.move.start',
      actor: { campaignId: 'campaign-1', userId: 'player-1', role: 'SPECTATOR' },
      tokenId: 'token-1',
      mapId: 'map-1',
    })).rejects.toMatchObject({
      code: 'SPECTATOR_NOT_ALLOWED',
      message: 'Spectators cannot move tokens',
    });
  });

  it('keeps the legacy finalization semantics distinct from drag-start spectators', async () => {
    const repository = makeRepository();
    const result = await new FinalizeTokenMove(repository, visibleSpirit).execute(playerCommand({
      actor: { campaignId: 'campaign-1', userId: 'player-1', role: 'SPECTATOR' },
    }));

    expect(result.token.position).toEqual({ x: 8, y: 9 });
    expect(repository.updateTokens).toHaveBeenCalledTimes(1);
  });

  it('requires spirit visibility for a non-DM final write', async () => {
    const repository = makeRepository(mapWith([{ ...token, layer: 'spirit' }]));
    const hiddenSpirit: SpiritVisibilityPolicy = { canSeeSpiritLayer: jest.fn(async () => false) };

    await expect(new FinalizeTokenMove(repository, hiddenSpirit).execute(playerCommand())).rejects.toMatchObject({
      code: 'SPIRIT_LAYER_NOT_ALLOWED',
      message: 'You cannot interact with spirit layer tokens',
    });
    expect(repository.updateTokens).not.toHaveBeenCalled();
  });

  it('silently discards a transient frame for another campaign but rejects a local out-of-bounds frame', async () => {
    const otherCampaign = makeRepository({ ...mapWith(), campaignId: 'other-campaign' });
    await expect(new PreviewTokenMove(otherCampaign).execute({
      type: 'token.move.preview',
      campaignId: 'campaign-1',
      tokenId: 'token-1',
      mapId: 'map-1',
      position: { x: 8, y: 9 },
    })).resolves.toBeNull();

    const repository = makeRepository();
    await expect(new PreviewTokenMove(repository).execute({
      type: 'token.move.preview',
      campaignId: 'campaign-1',
      tokenId: 'token-1',
      mapId: 'map-1',
      position: { x: 30, y: 9 },
    })).rejects.toMatchObject({
      code: 'POSITION_OUT_OF_BOUNDS',
      message: 'Token position out of bounds',
    });

    await expect(new FinalizeTokenMove(repository, visibleSpirit).execute(playerCommand({
      tokenId: 'missing-token',
      position: { x: 30, y: 9 },
    }))).rejects.toMatchObject({
      code: 'POSITION_OUT_OF_BOUNDS',
      message: 'Token position out of bounds',
    });
  });
});
