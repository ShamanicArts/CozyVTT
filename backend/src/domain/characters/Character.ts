/** Domain shape required by character mutation use cases. */
export interface CharacterRecord {
  id: string;
  userId: string;
  name: string;
  data: unknown;
  tokenImageUrl: string | null;
  gameSystem: string | null;
  campaignId: string | null;
}

export interface CharacterCampaign {
  id: string;
  name: string;
  gameSystem: string | null;
}

export interface CharacterMembership {
  role: string;
  characterIds: string[];
}

/** Transport-mappable failure preserving the established character API. */
export class CharacterError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404,
    public readonly error: string,
    message: string,
    public readonly validationErrors?: Array<{ path: string; message: string; code: string }>,
  ) {
    super(message);
    this.name = 'CharacterError';
  }
}
