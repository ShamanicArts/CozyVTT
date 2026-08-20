import { DiceParserError, parseDiceExpression, rollDice } from '../../utils/dice-parser';
import { DiceRollError, DiceRollResult } from '../../domain/dice/DiceRoll';
import { DiceExpressionRoller } from '../../ports/DiceExpressionRoller';

/** Adapts the established dice parser instead of reimplementing any dice rules. */
export class DiceParserExpressionRoller implements DiceExpressionRoller {
  validate(expression: string): void {
    try {
      parseDiceExpression(expression);
    } catch (error) {
      if (error instanceof DiceParserError) {
        throw new DiceRollError('INVALID_EXPRESSION', error.message);
      }
      throw error;
    }
  }

  roll(expression: string): DiceRollResult {
    try {
      return rollDice(expression);
    } catch (error) {
      if (error instanceof DiceParserError) {
        throw new DiceRollError('ROLL_FAILED', error.message);
      }
      throw error;
    }
  }
}
