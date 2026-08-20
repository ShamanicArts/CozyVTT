import { RollDice, RollDiceCommand } from './RollDice';
import { DiceRollError, DiceRollResult } from '../../domain/dice/DiceRoll';
import { CampaignDiceRollRateGate } from '../../ports/CampaignDiceRollRateGate';
import { DiceExpressionRoller } from '../../ports/DiceExpressionRoller';
import { DiceRollRepository } from '../../ports/DiceRollRepository';

const breakdown: DiceRollResult = {
  expression: '1d20+3', formula: '17 + 3', total: 20,
  rolls: [{ type: 'dice', notation: '1d20', count: 1, sides: 20, results: [17], kept: [17], total: 17 }, { type: 'modifier', value: 3 }],
};

const command = (overrides: Partial<RollDiceCommand> = {}): RollDiceCommand => ({
  type: 'dice.roll', campaignId: 'campaign-1', userId: 'user-1', expression: '1d20+3',
  characterName: 'Mira', purpose: 'Perception', secret: true, ...overrides,
});

describe('RollDice', () => {
  const repository: jest.Mocked<DiceRollRepository> = {
    findUserDisplayName: jest.fn(), createDiceRoll: jest.fn(), createDiceRollMessage: jest.fn(),
  };
  const roller: jest.Mocked<DiceExpressionRoller> = { validate: jest.fn(), roll: jest.fn() };
  const rateGate: jest.Mocked<CampaignDiceRollRateGate> = { tryAcquire: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    rateGate.tryAcquire.mockReturnValue(true);
    roller.roll.mockReturnValue(breakdown);
    repository.findUserDisplayName.mockResolvedValue('Mira Player');
    repository.createDiceRoll.mockResolvedValue({ id: 'roll-1' });
    repository.createDiceRollMessage.mockResolvedValue();
  });

  it('reuses the roller, persists its audit trail, and returns complete roll data', async () => {
    const result = await new RollDice(repository, roller, rateGate).execute(command());

    expect(roller.validate).toHaveBeenCalledWith('1d20+3');
    expect(roller.roll).toHaveBeenCalledWith('1d20+3');
    expect(repository.createDiceRoll).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 'campaign-1', userId: 'user-1', expression: '1d20+3', result: 20, breakdown, secret: true,
    }));
    expect(repository.createDiceRollMessage).toHaveBeenCalledWith(expect.objectContaining({
      content: 'Mira Player (Mira) rolled 1d20+3 for Perception (SECRET)',
      metadata: expect.objectContaining({ diceRollId: 'roll-1', breakdown, secret: true }),
    }));
    expect(result).toEqual(expect.objectContaining({ userId: 'user-1', userName: 'Mira Player', result: 20, breakdown, secret: true }));
    expect(result.timestamp).toEqual(expect.any(String));
  });

  it('does not roll or write when parser validation rejects the expression', async () => {
    roller.validate.mockImplementation(() => { throw new DiceRollError('INVALID_EXPRESSION', 'Invalid token: nope'); });

    await expect(new RollDice(repository, roller, rateGate).execute(command({ expression: 'nope' }))).rejects.toMatchObject({
      code: 'INVALID_EXPRESSION', message: 'Invalid token: nope',
    });
    expect(roller.roll).not.toHaveBeenCalled();
    expect(repository.createDiceRoll).not.toHaveBeenCalled();
  });

  it('preserves the dice rate-limit error before parser work', async () => {
    rateGate.tryAcquire.mockReturnValue(false);

    await expect(new RollDice(repository, roller, rateGate).execute(command())).rejects.toEqual(
      new DiceRollError('RATE_LIMITED', 'Rate limit exceeded. Maximum 30 dice rolls per minute.')
    );
    expect(roller.validate).not.toHaveBeenCalled();
  });
});
