import type {
  CreatureTemplate,
  CreatureUpdateData,
  NewCreature,
  SrdSeedResult,
} from "../domain/creatures/Creature";

/** Persistence and seed boundary for the creature library. */
export interface CreatureRepository {
  find(id: string): Promise<CreatureTemplate | null>;
  create(data: NewCreature): Promise<CreatureTemplate>;
  update(id: string, data: CreatureUpdateData): Promise<CreatureTemplate>;
  delete(id: string): Promise<void>;
  favorite(
    campaignId: string,
    userId: string,
    creatureId: string,
  ): Promise<boolean>;
  seed(): Promise<SrdSeedResult>;
}
