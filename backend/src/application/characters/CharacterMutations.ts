import { Command, CommandHandler } from '../commands/CommandBus';
import { GameSystem } from '../../game-systems';
import { validateCharacterData } from '../../validators/game-systems';
import { CreateCharacterSchema, UpdateCharacterSchema } from '../../validators/characters';
import { CharacterError, CharacterRecord } from '../../domain/characters/Character';
import { CharacterAssetUrlNormalizer } from '../../ports/CharacterAssetUrlNormalizer';
import { CharacterEventPublisher } from '../../ports/CharacterEventPublisher';
import { CharacterRepository, CharacterUpdateInput } from '../../ports/CharacterRepository';

export const CREATE_CHARACTER = 'character.create' as const;
export const UPDATE_CHARACTER = 'character.update' as const;
export const DELETE_CHARACTER = 'character.delete' as const;
export const ASSIGN_CHARACTER = 'character.assign' as const;
export const COPY_CHARACTER = 'character.copy' as const;

export interface CharacterMutationResult { character: unknown }

export interface CreateCharacterCommand extends Command<CharacterMutationResult> {
  readonly type: typeof CREATE_CHARACTER;
  readonly userId: string;
  readonly input: unknown;
}

export interface UpdateCharacterCommand extends Command<CharacterMutationResult> {
  readonly type: typeof UPDATE_CHARACTER;
  readonly userId: string;
  readonly characterId: string;
  readonly input: unknown;
}

export interface DeleteCharacterCommand extends Command<void> {
  readonly type: typeof DELETE_CHARACTER;
  readonly userId: string;
  readonly characterId: string;
}

export interface AssignCharacterCommand extends Command<CharacterMutationResult> {
  readonly type: typeof ASSIGN_CHARACTER;
  readonly userId: string;
  readonly characterId: string;
  readonly campaignId: unknown;
}

export interface CopyCharacterCommand extends Command<CharacterMutationResult> {
  readonly type: typeof COPY_CHARACTER;
  readonly userId: string;
  readonly characterId: string;
}

const validSystems: string[] = [
  GameSystem.DND_5E,
  GameSystem.PATHFINDER_2E,
  GameSystem.SHADOWRUN_6E,
  GameSystem.CALL_OF_CTHULHU_7E,
];

function schemaError(
  message: string,
  error: { issues: Array<{ path: PropertyKey[]; message: string; code: string }> },
  includeValidationErrors = false,
): CharacterError {
  return new CharacterError(
    400,
    'Validation Error',
    message,
    includeValidationErrors
      ? error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message, code: issue.code }))
      : undefined,
  );
}

function characterNotFound(): CharacterError {
  return new CharacterError(404, 'Not Found', 'Character not found');
}

abstract class CharacterCommandBase {
  constructor(
    protected readonly repository: CharacterRepository,
    protected readonly assets: CharacterAssetUrlNormalizer,
    protected readonly events: CharacterEventPublisher,
  ) {}

  protected async characterOrThrow(characterId: string): Promise<CharacterRecord> {
    const character = await this.repository.findCharacter(characterId);
    if (!character) throw characterNotFound();
    return character;
  }

  /** Event delivery was intentionally best-effort in the original REST adapter. */
  protected publishBestEffort(campaignId: string, event: string, payload: unknown): void {
    try {
      this.events.publish(campaignId, event, payload);
    } catch {
      // A websocket failure must not roll back or fail a persisted mutation.
    }
  }
}

export class CreateCharacter extends CharacterCommandBase implements CommandHandler<CreateCharacterCommand, CharacterMutationResult> {
  async execute(command: CreateCharacterCommand): Promise<CharacterMutationResult> {
    const parsed = CreateCharacterSchema.safeParse(command.input);
    if (!parsed.success) {
      throw schemaError(parsed.error.issues[0]?.message ?? 'Invalid character data', parsed.error);
    }
    const { name, data, tokenImageUrl, gameSystem, campaignId } = parsed.data;
    let finalGameSystem = gameSystem;
    if (campaignId && !gameSystem) {
      const campaign = await this.repository.findCampaign(campaignId);
      if (campaign) finalGameSystem = campaign.gameSystem as GameSystem | null;
    }
    if (finalGameSystem !== undefined && finalGameSystem !== null) {
      if (!validSystems.includes(finalGameSystem as string)) {
        throw new CharacterError(400, 'Validation Error', `Invalid game system. Must be one of: ${validSystems.join(', ')}`);
      }
      const validated = validateCharacterData(finalGameSystem as GameSystem, data || {});
      if (!validated.success) {
        throw schemaError('Character data does not match game system schema', validated.errors, true);
      }
    }
    const character = await this.repository.createCharacter({
      userId: command.userId,
      name,
      data: data || {},
      tokenImageUrl: tokenImageUrl ? this.assets.normalizeTokenImageUrl(tokenImageUrl) : null,
      campaignId: campaignId || null,
      gameSystem: finalGameSystem || null,
    });
    return { character };
  }
}

export class UpdateCharacter extends CharacterCommandBase implements CommandHandler<UpdateCharacterCommand, CharacterMutationResult> {
  async execute(command: UpdateCharacterCommand): Promise<CharacterMutationResult> {
    const parsed = UpdateCharacterSchema.safeParse(command.input);
    if (!parsed.success) {
      throw schemaError(parsed.error.issues[0]?.message ?? 'Invalid character data', parsed.error);
    }
    const character = await this.characterOrThrow(command.characterId);
    const { name, data, tokenImageUrl, gameSystem } = parsed.data;
    if (gameSystem !== undefined && gameSystem !== character.gameSystem) {
      throw new CharacterError(400, 'Bad Request', 'Cannot change game system after character creation. Create a new character instead.');
    }
    let isAuthorized = character.userId === command.userId;
    if (!isAuthorized && character.campaignId) {
      const membership = await this.repository.findMembership(command.userId, character.campaignId);
      isAuthorized = membership?.role === 'DM';
    }
    if (!isAuthorized) throw new CharacterError(403, 'Forbidden', 'You do not have permission to edit this character');

    if (character.gameSystem && data !== undefined) {
      const validated = validateCharacterData(character.gameSystem as GameSystem, data);
      if (!validated.success) {
        throw schemaError('Character data does not match game system schema', validated.errors, true);
      }
    }
    const update: CharacterUpdateInput = {};
    if (name !== undefined) update.name = name;
    if (data !== undefined) update.data = data;
    if (tokenImageUrl !== undefined) {
      update.tokenImageUrl = tokenImageUrl ? this.assets.normalizeTokenImageUrl(tokenImageUrl) : null;
    }
    const updatedCharacter = await this.repository.updateCharacterForEdit(command.characterId, update);
    // This mirrors the existing route: determine event scope from the persisted response.
    const campaignId = (updatedCharacter as { campaignId?: string | null }).campaignId;
    if (campaignId) {
      this.publishBestEffort(campaignId, 'character.updated', {
        characterId: (updatedCharacter as { id: string }).id,
        character: updatedCharacter,
        userId: command.userId,
      });
    }
    return { character: updatedCharacter };
  }
}

export class DeleteCharacter extends CharacterCommandBase implements CommandHandler<DeleteCharacterCommand, void> {
  async execute(command: DeleteCharacterCommand): Promise<void> {
    const character = await this.characterOrThrow(command.characterId);
    if (character.userId !== command.userId) {
      throw new CharacterError(403, 'Forbidden', 'Only the character owner can delete this character');
    }
    await this.repository.deleteCharacter(command.characterId);
  }
}

export class AssignCharacter extends CharacterCommandBase implements CommandHandler<AssignCharacterCommand, CharacterMutationResult> {
  async execute(command: AssignCharacterCommand): Promise<CharacterMutationResult> {
    const character = await this.characterOrThrow(command.characterId);
    if (character.userId !== command.userId) {
      throw new CharacterError(403, 'Forbidden', 'Only the character owner can assign this character to a campaign');
    }
    const campaignId = command.campaignId as string | null | undefined;
    if (!campaignId || campaignId === '') {
      if (character.campaignId) await this.removeFromMembership(command.userId, character.campaignId, character.id);
      const updatedCharacter = await this.repository.updateCharacterForAssignment(character.id, null);
      if (character.campaignId) {
        this.publishBestEffort(character.campaignId, 'roster.updated', {
          action: 'character.unassigned', characterId: character.id, userId: command.userId,
        });
      }
      return { character: updatedCharacter };
    }

    const campaign = await this.repository.findCampaign(campaignId);
    if (!campaign) throw new CharacterError(404, 'Not Found', 'Campaign not found');
    const membership = await this.repository.findMembership(command.userId, campaignId);
    if (!membership) {
      throw new CharacterError(403, 'Forbidden', 'You must be a member of the campaign to assign a character to it');
    }
    const systemsCompatible =
      (!character.gameSystem && !campaign.gameSystem) ||
      (!!character.gameSystem && !!campaign.gameSystem && character.gameSystem === campaign.gameSystem);
    if (!systemsCompatible) {
      const charLabel = character.gameSystem ?? 'flexible';
      const campLabel = campaign.gameSystem ?? 'flexible';
      throw new CharacterError(400, 'Game System Mismatch', `Cannot assign a ${charLabel} character to a ${campLabel} campaign. Character and campaign game systems must match.`);
    }
    if (character.campaignId && character.campaignId !== campaignId) {
      await this.removeFromMembership(command.userId, character.campaignId, character.id);
    }
    if (!membership.characterIds.includes(character.id)) {
      await this.repository.updateMembershipCharacterIds(command.userId, campaignId, [...membership.characterIds, character.id]);
    }
    const updatedCharacter = await this.repository.updateCharacterForAssignment(character.id, campaignId);
    this.publishBestEffort(campaignId, 'roster.updated', {
      action: 'character.assigned', characterId: character.id, userId: command.userId, campaignId,
    });
    return { character: updatedCharacter };
  }

  private async removeFromMembership(userId: string, campaignId: string, characterId: string): Promise<void> {
    const membership = await this.repository.findMembership(userId, campaignId);
    if (membership) {
      await this.repository.updateMembershipCharacterIds(
        userId,
        campaignId,
        membership.characterIds.filter((id) => id !== characterId),
      );
    }
  }
}

export class CopyCharacter extends CharacterCommandBase implements CommandHandler<CopyCharacterCommand, CharacterMutationResult> {
  async execute(command: CopyCharacterCommand): Promise<CharacterMutationResult> {
    const original = await this.characterOrThrow(command.characterId);
    if (original.userId !== command.userId) {
      throw new CharacterError(403, 'Forbidden', 'You do not have permission to copy this character');
    }
    const character = await this.repository.createCharacter({
      userId: command.userId,
      name: `${original.name} (Copy)`,
      data: original.data,
      tokenImageUrl: original.tokenImageUrl,
      gameSystem: original.gameSystem,
      campaignId: null,
    });
    return { character };
  }
}
