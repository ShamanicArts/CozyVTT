import { DiceRollResult } from '../domain/dice/DiceRoll';

/** Persistence boundary for dice rolls and their audit chat messages. */
export interface DiceRollRepository {
  findUserDisplayName(userId: string): Promise<string | null>;
  createDiceRoll(input: {
    campaignId: string;
    userId: string;
    expression: string;
    result: number;
    breakdown: DiceRollResult;
    characterName: string | null;
    purpose: string | null;
    secret: boolean;
  }): Promise<{ id: string }>;
  createDiceRollMessage(input: {
    campaignId: string;
    userId: string;
    content: string;
    metadata: {
      diceRollId: string;
      expression: string;
      result: number;
      breakdown: DiceRollResult;
      characterName: string | null;
      purpose: string | null;
      secret: boolean;
    };
  }): Promise<void>;
}
