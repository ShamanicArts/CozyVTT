export interface RealtimeCharacterRecord {
  id: string;
  userId: string;
  gameSystem: string | null;
  data: unknown;
}
export interface RealtimeCharacterRepository {
  findCharacter(characterId: string): Promise<RealtimeCharacterRecord | null>;
  characterMembership(
    campaignId: string,
    characterId: string,
  ): Promise<boolean>;
  updateCharacterData(characterId: string, data: unknown): Promise<void>;
}
