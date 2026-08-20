/** Transport- and persistence-neutral creature-library records. */

export type CreatureGameSystem =
  "DND_5E" | "PATHFINDER_2E" | "SHADOWRUN_6E" | "CALL_OF_CTHULHU_7E";

export interface CreatureSize {
  width: number;
  height: number;
}

export type CreatureStatBlock = Record<string, unknown>;

export interface NewCreature {
  name: string;
  gameSystem: CreatureGameSystem | null;
  source: string;
  challengeRating: string | null;
  creatureType: string | null;
  alignment: string | null;
  imageUrl: string | null;
  statBlock: CreatureStatBlock;
  size: CreatureSize;
  disposition: string;
  displayMode: string;
  createdById: string | null;
  campaignId: string | null;
}

export interface CreatureTemplate extends NewCreature {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Fields accepted by the existing create route before defaults are applied. */
export interface CreatureCreateData {
  name?: unknown;
  gameSystem?: CreatureGameSystem | null;
  challengeRating?: string | null;
  creatureType?: string | null;
  alignment?: string | null;
  imageUrl?: string | null;
  statBlock?: unknown;
  size?: CreatureSize;
  disposition?: string;
  displayMode?: string;
}

/** Custom creatures retain the existing broad editable field set. */
export type CreatureUpdateData = Partial<
  Pick<
    NewCreature,
    | "name"
    | "gameSystem"
    | "source"
    | "challengeRating"
    | "creatureType"
    | "alignment"
    | "imageUrl"
    | "statBlock"
    | "size"
    | "disposition"
    | "displayMode"
  >
>;

export interface SrdSeedResult {
  created: number;
  updated: number;
  skipped: number;
  alreadyExisted: number;
}
