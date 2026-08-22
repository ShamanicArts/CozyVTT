import {
  AssignCharacter,
  CopyCharacter,
  CreateCharacter,
  DeleteCharacter,
  UpdateCharacter,
} from './CharacterMutations';
import { CharacterRecord } from '../../domain/characters/Character';
import { CharacterEventPublisher } from '../../ports/CharacterEventPublisher';
import { CharacterRepository } from '../../ports/CharacterRepository';
import { GameSystem } from '../../game-systems';
import { getBlankCharacterTemplate } from '../../validators/game-systems';

const character: CharacterRecord = {
  id: 'character-1', userId: 'owner-1', name: 'Mira', data: { notes: 'watchful' },
  tokenImageUrl: '/api/assets/tokens/old', gameSystem: null, campaignId: 'campaign-old',
};

function repository(overrides: Partial<CharacterRepository> = {}): CharacterRepository {
  return {
    findCharacter: jest.fn(async () => character),
    findCampaign: jest.fn(async (id) => ({ id, name: id, gameSystem: null })),
    findMembership: jest.fn(async () => ({ role: 'PLAYER', characterIds: [character.id] })),
    createCharacter: jest.fn(async (input) => ({ id: 'character-new', ...input })),
    updateCharacterForEdit: jest.fn(async (_id, input) => ({ ...character, ...input, campaign: { id: 'campaign-old', name: 'Old' } })),
    updateCharacterForAssignment: jest.fn(async (_id, campaignId) => ({ ...character, campaignId, campaign: campaignId ? { id: campaignId, name: 'New', gameSystem: null } : null })),
    deleteCharacter: jest.fn(async () => undefined),
    updateMembershipCharacterIds: jest.fn(async () => undefined),
    ...overrides,
  };
}

function events(): CharacterEventPublisher & { publish: jest.Mock } {
  return { publish: jest.fn() };
}

describe('character mutation commands', () => {
  it('creates a flexible character with legacy defaults and image normalization', async () => {
    const store = repository();
    const result = await new CreateCharacter(store, events()).execute({
      type: 'character.create', userId: 'owner-1', input: { name: 'New Hero', tokenImageUrl: 'asset-1' },
    });
    expect(result.character).toMatchObject({ name: 'New Hero', data: {}, tokenImageUrl: '/api/assets/tokens/asset-1', campaignId: null });
  });

  it('inherits and validates a campaign game system before creating', async () => {
    const store = repository({
      findCampaign: jest.fn(async () => ({ id: 'campaign-1', name: 'D&D', gameSystem: GameSystem.DND_5E })),
    });
    await new CreateCharacter(store, events()).execute({
      type: 'character.create',
      userId: 'owner-1',
      input: { name: 'Fighter', campaignId: 'campaign-1', data: getBlankCharacterTemplate(GameSystem.DND_5E) },
    });
    expect(store.createCharacter).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 'campaign-1', gameSystem: GameSystem.DND_5E,
    }));
  });

  it('keeps schema errors and owner/DM update policy at the application boundary', async () => {
    const store = repository();
    await expect(new UpdateCharacter(store, events()).execute({
      type: 'character.update', userId: 'owner-1', characterId: character.id, input: { name: '' },
    })).rejects.toMatchObject({ status: 400, error: 'Validation Error', message: 'Character name is required', validationErrors: undefined });

    await expect(new UpdateCharacter(repository({ findMembership: jest.fn(async () => null) }), events()).execute({
      type: 'character.update', userId: 'other-user', characterId: character.id, input: { name: 'Nope' },
    })).rejects.toMatchObject({ status: 403, message: 'You do not have permission to edit this character' });
  });

  it('updates an owner character and publishes the unchanged campaign event payload', async () => {
    const store = repository();
    const publisher = events();
    const result = await new UpdateCharacter(store, publisher).execute({
      type: 'character.update', userId: 'owner-1', characterId: character.id, input: { tokenImageUrl: null },
    });
    expect(result.character).toMatchObject({ tokenImageUrl: null });
    expect(publisher.publish).toHaveBeenCalledWith('campaign-old', 'character.updated', expect.objectContaining({ characterId: character.id, userId: 'owner-1' }));
  });

  it('enforces owner-only deletion and copy semantics', async () => {
    const store = repository();
    await expect(new DeleteCharacter(store, events()).execute({ type: 'character.delete', userId: 'other-user', characterId: character.id }))
      .rejects.toMatchObject({ status: 403, message: 'Only the character owner can delete this character' });
    const copied = await new CopyCharacter(store, events()).execute({ type: 'character.copy', userId: 'owner-1', characterId: character.id });
    expect(copied.character).toMatchObject({ name: 'Mira (Copy)', campaignId: null, gameSystem: null });
  });

  it('moves membership and emits roster events when assigning and unassigning', async () => {
    const store = repository({
      findMembership: jest.fn(async (_userId, campaignId) => ({ role: 'PLAYER', characterIds: campaignId === 'campaign-new' ? [] : [character.id] })),
    });
    const publisher = events();
    const command = new AssignCharacter(store, publisher);
    await command.execute({ type: 'character.assign', userId: 'owner-1', characterId: character.id, campaignId: 'campaign-new' });
    expect(store.updateMembershipCharacterIds).toHaveBeenCalledWith('owner-1', 'campaign-old', []);
    expect(store.updateMembershipCharacterIds).toHaveBeenCalledWith('owner-1', 'campaign-new', [character.id]);
    expect(publisher.publish).toHaveBeenCalledWith('campaign-new', 'roster.updated', expect.objectContaining({ action: 'character.assigned' }));

    await command.execute({ type: 'character.assign', userId: 'owner-1', characterId: character.id, campaignId: null });
    expect(publisher.publish).toHaveBeenCalledWith('campaign-old', 'roster.updated', expect.objectContaining({ action: 'character.unassigned' }));
  });
});
