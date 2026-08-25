import type {
  CreatureCreateData,
  CreatureStatBlock,
  CreatureTemplate,
  CreatureUpdateData,
  SrdSeedResult,
} from "../../domain/creatures/Creature";
import type { CreatureRepository } from "../../ports/CreatureRepository";
import { normalizeAssetUrl } from "../../utils/asset-urls";
import {
  CreateCreatureSchema,
  UpdateCreatureSchema,
} from "../../validators/creatures";
import { isSupportedGameSystem } from "../../game-systems/registry";
import type { Command, CommandHandler } from "../commands/CommandBus";

export const CREATE_CREATURE = "creature.create" as const;
export const UPDATE_CREATURE = "creature.update" as const;
export const DELETE_CREATURE = "creature.delete" as const;
export const DUPLICATE_CREATURE = "creature.duplicate" as const;
export const TOGGLE_CREATURE_FAVORITE = "creature.favorite.toggle" as const;
export const SEED_SRD_CREATURES = "creature.srd.seed" as const;

type CreatureErrorCode = "Validation Error" | "Forbidden" | "Not Found";

export class CreatureError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404,
    public readonly error: CreatureErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface CreateCreatureCommand extends Command<CreatureTemplate> {
  readonly type: typeof CREATE_CREATURE;
  readonly campaignId: string;
  readonly userId: string;
  readonly data: CreatureCreateData;
}

export interface UpdateCreatureCommand extends Command<CreatureTemplate> {
  readonly type: typeof UPDATE_CREATURE;
  readonly campaignId: string;
  readonly creatureId: string;
  readonly data: CreatureUpdateData;
}

export interface DeleteCreatureCommand extends Command<void> {
  readonly type: typeof DELETE_CREATURE;
  readonly campaignId: string;
  readonly creatureId: string;
}

export interface DuplicateCreatureCommand extends Command<CreatureTemplate> {
  readonly type: typeof DUPLICATE_CREATURE;
  readonly campaignId: string;
  readonly creatureId: string;
  readonly userId: string;
}

export interface ToggleCreatureFavoriteCommand extends Command<boolean> {
  readonly type: typeof TOGGLE_CREATURE_FAVORITE;
  readonly campaignId: string;
  readonly creatureId: string;
  readonly userId: string;
}

export interface SeedSrdCreaturesCommand extends Command<SrdSeedResult> {
  readonly type: typeof SEED_SRD_CREATURES;
}

async function ownedCustomCreature(
  repository: CreatureRepository,
  campaignId: string,
  creatureId: string,
  action: "edit" | "delete",
): Promise<CreatureTemplate> {
  const creature = await repository.find(creatureId);
  if (!creature) {
    throw new CreatureError(404, "Not Found", "Creature template not found");
  }
  if (creature.source === "srd") {
    throw new CreatureError(
      403,
      "Forbidden",
      action === "edit"
        ? "Cannot edit SRD creatures. Duplicate it first to create a custom version."
        : "Cannot delete SRD creatures",
    );
  }
  if (creature.campaignId !== campaignId) {
    throw new CreatureError(
      403,
      "Forbidden",
      action === "edit"
        ? "Cannot edit creatures from another campaign"
        : "Cannot delete creatures from another campaign",
    );
  }
  return creature;
}

function statBlockOrThrow(statBlock: unknown): CreatureStatBlock {
  if (!statBlock || typeof statBlock !== "object" || Array.isArray(statBlock)) {
    throw new CreatureError(400, "Validation Error", "Stat block is required");
  }
  return statBlock as CreatureStatBlock;
}

export class CreateCreature implements CommandHandler<
  CreateCreatureCommand,
  CreatureTemplate
> {
  constructor(private readonly repository: CreatureRepository) {}

  async execute(command: CreateCreatureCommand): Promise<CreatureTemplate> {
    const parsed = CreateCreatureSchema.safeParse(command.data);
    if (!parsed.success) {
      throw new CreatureError(
        400,
        "Validation Error",
        parsed.error.issues.map((issue) => issue.message).join("; "),
      );
    }
    const data = parsed.data;
    if (data.gameSystem && !isSupportedGameSystem(data.gameSystem)) {
      throw new CreatureError(400, "Validation Error", "Game system is not active");
    }

    return this.repository.create({
      name: data.name,
      gameSystem: data.gameSystem ?? null,
      source: "custom",
      challengeRating: data.challengeRating ?? null,
      creatureType: data.creatureType ?? null,
      alignment: data.alignment ?? null,
      imageUrl: normalizeAssetUrl(data.imageUrl, "tokens"),
      statBlock: statBlockOrThrow(data.statBlock),
      size: data.size ?? { width: 1, height: 1 },
      disposition: data.disposition ?? "hostile",
      displayMode: data.displayMode ?? "pog",
      createdById: command.userId,
      campaignId: command.campaignId,
    });
  }
}

export class UpdateCreature implements CommandHandler<
  UpdateCreatureCommand,
  CreatureTemplate
> {
  constructor(private readonly repository: CreatureRepository) {}

  async execute(command: UpdateCreatureCommand): Promise<CreatureTemplate> {
    const parsed = UpdateCreatureSchema.safeParse(command.data);
    if (!parsed.success) {
      throw new CreatureError(
        400,
        "Validation Error",
        parsed.error.issues.map((issue) => issue.message).join("; "),
      );
    }
    await ownedCustomCreature(
      this.repository,
      command.campaignId,
      command.creatureId,
      "edit",
    );
    if (parsed.data.gameSystem && !isSupportedGameSystem(parsed.data.gameSystem)) {
      throw new CreatureError(400, "Validation Error", "Game system is not active");
    }
    return this.repository.update(command.creatureId, {
      ...parsed.data,
      ...(parsed.data.imageUrl !== undefined && {
        imageUrl: normalizeAssetUrl(parsed.data.imageUrl, "tokens"),
      }),
    });
  }
}

export class DeleteCreature implements CommandHandler<
  DeleteCreatureCommand,
  void
> {
  constructor(private readonly repository: CreatureRepository) {}

  async execute(command: DeleteCreatureCommand): Promise<void> {
    await ownedCustomCreature(
      this.repository,
      command.campaignId,
      command.creatureId,
      "delete",
    );
    await this.repository.delete(command.creatureId);
  }
}

export class DuplicateCreature implements CommandHandler<
  DuplicateCreatureCommand,
  CreatureTemplate
> {
  constructor(private readonly repository: CreatureRepository) {}

  async execute(command: DuplicateCreatureCommand): Promise<CreatureTemplate> {
    const source = await this.repository.find(command.creatureId);
    if (!source) {
      throw new CreatureError(404, "Not Found", "Creature template not found");
    }

    return this.repository.create({
      name: `${source.name} (Custom)`,
      gameSystem: source.gameSystem,
      source: "custom",
      challengeRating: source.challengeRating,
      creatureType: source.creatureType,
      alignment: source.alignment,
      imageUrl: normalizeAssetUrl(source.imageUrl, "tokens"),
      statBlock: source.statBlock,
      size: source.size,
      disposition: source.disposition,
      displayMode: source.displayMode,
      createdById: command.userId,
      campaignId: command.campaignId,
    });
  }
}

export class ToggleCreatureFavorite implements CommandHandler<
  ToggleCreatureFavoriteCommand,
  boolean
> {
  constructor(private readonly repository: CreatureRepository) {}

  execute(command: ToggleCreatureFavoriteCommand): Promise<boolean> {
    return this.repository.favorite(
      command.campaignId,
      command.userId,
      command.creatureId,
    );
  }
}

export class SeedSrdCreatures implements CommandHandler<
  SeedSrdCreaturesCommand,
  SrdSeedResult
> {
  constructor(private readonly repository: CreatureRepository) {}

  execute(): Promise<SrdSeedResult> {
    return this.repository.seed();
  }
}
