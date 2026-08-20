import { DiceRollResult } from '../domain/dice/DiceRoll';

/** Existing dice-parser service exposed to application commands through a port. */
export interface DiceExpressionRoller {
  validate(expression: string): void;
  roll(expression: string): DiceRollResult;
}
