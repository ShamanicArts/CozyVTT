import { DiceRollError, DiceRollResult } from '../../domain/dice/DiceRoll';
import { CampaignDiceRollRateGate } from '../../ports/CampaignDiceRollRateGate';
import { DiceExpressionRoller } from '../../ports/DiceExpressionRoller';
import { DiceRollRepository } from '../../ports/DiceRollRepository';
import { Command, CommandHandler } from '../commands/CommandBus';

export const ROLL_DICE = 'dice.roll' as const;

export interface RollDiceCommand extends Command<RollDiceResult> {
  readonly type: typeof ROLL_DICE;
  readonly campaignId: string;
  readonly userId: string;
  readonly expression: unknown;
  readonly characterName?: string;
  readonly purpose?: string;
  readonly secret?: boolean;
}

/** Complete public roll data; recipient filtering belongs to the transport adapter. */
export interface RollDiceResult {
  userId: string;
  userName: string;
  characterName: string | null;
  expression: string;
  result: number;
  breakdown: DiceRollResult;
  purpose: string | null;
  timestamp: string;
  secret: boolean;
}

export class RollDice implements CommandHandler<RollDiceCommand, RollDiceResult> {
  constructor(
    private readonly repository: DiceRollRepository,
    private readonly roller: DiceExpressionRoller,
    private readonly rateGate: CampaignDiceRollRateGate
  ) {}

  async execute(command: RollDiceCommand): Promise<RollDiceResult> {
    if (!command.expression || typeof command.expression !== 'string') {
      throw new DiceRollError('EXPRESSION_REQUIRED', 'Dice expression required');
    }
    if (!this.rateGate.tryAcquire(command.userId)) {
      throw new DiceRollError('RATE_LIMITED', 'Rate limit exceeded. Maximum 30 dice rolls per minute.');
    }

    // Keep validation and execution distinct: the legacy websocket contract
    // gives syntax failures a different error prefix from a failed roll.
    this.roller.validate(command.expression);
    const breakdown = this.roller.roll(command.expression);
    const userName = await this.repository.findUserDisplayName(command.userId);
    if (!userName) {
      throw new DiceRollError('USER_NOT_FOUND', 'User not found');
    }

    const characterName = command.characterName || null;
    const purpose = command.purpose || null;
    const secret = command.secret || false;
    const diceRoll = await this.repository.createDiceRoll({
      campaignId: command.campaignId,
      userId: command.userId,
      expression: command.expression,
      result: breakdown.total,
      breakdown,
      characterName,
      purpose,
      secret,
    });

    await this.repository.createDiceRollMessage({
      campaignId: command.campaignId,
      userId: command.userId,
      content: `${userName}${characterName ? ` (${characterName})` : ''} rolled ${command.expression}${purpose ? ` for ${purpose}` : ''}${secret ? ' (SECRET)' : ''}`,
      metadata: {
        diceRollId: diceRoll.id,
        expression: command.expression,
        result: breakdown.total,
        // The JSON conversion happens at the persistence edge, exactly as the
        // old handler did before storing the parser's roll result.
        breakdown,
        characterName,
        purpose,
        secret,
      },
    });

    return {
      userId: command.userId,
      userName,
      characterName,
      expression: command.expression,
      result: breakdown.total,
      breakdown,
      purpose,
      timestamp: new Date().toISOString(),
      secret,
    };
  }
}
