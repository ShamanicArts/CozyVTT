import { CharacterCampaign, CharacterMembership, CharacterRecord } from '../domain/characters/Character';

export interface CharacterCreateInput {
  userId: string;
  name: string;
  data: unknown;
  tokenImageUrl: string | null;
  campaignId: string | null;
  gameSystem: string | null;
}

export interface CharacterUpdateInput {
  name?: string;
  data?: unknown;
  tokenImageUrl?: string | null;
  campaignId?: string | null;
}

/** Persistence boundary for character write operations. */
export interface CharacterRepository {
  findCharacter(id: string): Promise<CharacterRecord | null>;
  findCampaign(id: string): Promise<CharacterCampaign | null>;
  findMembership(userId: string, campaignId: string): Promise<CharacterMembership | null>;
  createCharacter(input: CharacterCreateInput): Promise<unknown>;
  updateCharacterForEdit(id: string, input: CharacterUpdateInput): Promise<unknown>;
  updateCharacterForAssignment(id: string, campaignId: string | null): Promise<unknown>;
  deleteCharacter(id: string): Promise<void>;
  updateMembershipCharacterIds(userId: string, campaignId: string, characterIds: string[]): Promise<void>;
}
