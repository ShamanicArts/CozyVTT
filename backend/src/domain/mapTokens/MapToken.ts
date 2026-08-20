/** Domain representation of a token embedded in a map's JSON token array. */
export interface MapToken {
  id: string;
  characterId?: string | null;
  name: string;
  imageUrl: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  layer: 'token' | 'spirit';
  visible: boolean;
  controlledBy?: string | null;
  rotation: number;
  conditions: string[];
  metadata: Record<string, unknown>;
  type?: 'player' | 'npc' | 'object';
  disposition?: 'friendly' | 'neutral' | 'hostile' | null;
  hp?: { current: number; max: number; temp: number } | null;
  showHpBar?: boolean;
  notes?: string;
  initiative?: number | null;
  displayMode?: 'pog' | 'top-down' | 'full-art';
  statBlock?: Record<string, unknown> | null;
  creatureTemplateId?: string | null;
}

export interface MapTokenMap {
  id: string;
  campaignId: string;
  width: number;
  height: number;
  tokens: MapToken[];
}

/** Adapter-mappable failure preserving the legacy HTTP response contract. */
export class MapTokenError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404,
    public readonly error: 'Validation Error' | 'Forbidden' | 'Not Found',
    message: string
  ) {
    super(message);
    this.name = 'MapTokenError';
  }
}
