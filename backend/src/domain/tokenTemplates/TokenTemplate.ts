/**
 * Domain model for a reusable map token.  This deliberately has no Prisma,
 * Express, or websocket dependency so it can be created by an HTTP route,
 * an import job, or a future capability adapter.
 */

export type TokenTemplateType = 'player' | 'npc' | 'object';
export type TokenDisposition = 'friendly' | 'neutral' | 'hostile';
export type TokenDisplayMode = 'pog' | 'top-down' | 'full-art';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface TokenSize {
  width: number;
  height: number;
}

export interface TokenHp {
  current: number;
  max: number;
  temp: number;
}

export interface NewTokenTemplate {
  id: string;
  campaignId: string;
  // Imported templates may not retain a creator, while HTTP-created templates do.
  createdById: string | null;
  name: string;
  imageUrl: string | null;
  type: TokenTemplateType;
  disposition: TokenDisposition | null;
  displayMode: TokenDisplayMode;
  size: TokenSize;
  notes: string | null;
  hp: TokenHp | null;
  showHpBar: boolean;
  statBlock: JsonValue | null;
  sightRadius: number | null;
}

export interface TokenTemplate extends NewTokenTemplate {
  createdAt: Date;
  updatedAt: Date;
}

export interface TokenTemplateCreated {
  readonly type: 'token-template.created';
  readonly occurredAt: Date;
  readonly template: TokenTemplate;
}

export function tokenTemplateCreated(template: TokenTemplate): TokenTemplateCreated {
  return {
    type: 'token-template.created',
    occurredAt: new Date(),
    template,
  };
}
