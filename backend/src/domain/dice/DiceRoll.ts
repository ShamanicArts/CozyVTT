/** Transport-neutral dice result shape. It intentionally matches the legacy parser output. */
export interface DiceTerm {
  type: 'dice' | 'modifier';
  notation?: string;
  count?: number;
  sides?: number;
  results?: number[];
  kept?: number[];
  total?: number;
  value?: number;
  modifier?: 'kh' | 'kl' | 'dl';
  modifierCount?: number;
}

export interface DiceRollResult {
  expression: string;
  rolls: DiceTerm[];
  total: number;
  formula: string;
}

export class DiceRollError extends Error {
  constructor(
    public readonly code: 'EXPRESSION_REQUIRED' | 'RATE_LIMITED' | 'INVALID_EXPRESSION' | 'ROLL_FAILED' | 'USER_NOT_FOUND',
    message: string
  ) {
    super(message);
    this.name = 'DiceRollError';
  }
}
