import { GameSystem } from "../../game-systems";
import type { CharacterQueryRepository } from "../../ports/CharacterQueryRepository";
import { validateCharacterData } from "../../validators/game-systems";
import { getCharacterTemplate } from "../../utils/character-templates";
import { FLEXIBLE_TEMPLATES } from "../../utils/character-templates/flexible-templates";

export class CharacterQueryError extends Error {
  constructor(
    readonly status: 400 | 403 | 404,
    readonly error: string,
    message: string,
  ) {
    super(message);
    this.name = "CharacterQueryError";
  }
}

export class CharacterQueries {
  constructor(private readonly characters: CharacterQueryRepository) {}

  ownedBy(userId: string) {
    return this.characters.ownedBy(userId);
  }

  async visibleTo(userId: string, id: string) {
    const character = await this.required(id);
    if (character.userId === userId) return character;
    if (
      typeof character.campaignId === "string" &&
      (await this.characters.isCampaignMember(userId, character.campaignId))
    )
      return character;
    throw new CharacterQueryError(
      403,
      "Forbidden",
      "You do not have permission to view this character",
    );
  }

  template(gameSystem: string, templateName: string) {
    if (!gameSystem || gameSystem === "null" || gameSystem === "undefined") {
      const template = FLEXIBLE_TEMPLATES[templateName];
      if (!template)
        throw new CharacterQueryError(
          404,
          "Template Not Found",
          `Template '${templateName}' not found for flexible characters`,
        );
      return template;
    }
    if (!Object.values(GameSystem).includes(gameSystem as GameSystem))
      throw new CharacterQueryError(
        400,
        "Validation Error",
        `Invalid game system: ${gameSystem}`,
      );
    return getCharacterTemplate(gameSystem as GameSystem, templateName);
  }

  async validate(userId: string, id: string) {
    const character = await this.required(id);
    if (character.userId !== userId)
      throw new CharacterQueryError(
        403,
        "Forbidden",
        "You do not have permission to validate this character",
      );
    if (!character.gameSystem)
      return {
        isValid: false,
        errors: [
          {
            path: "gameSystem",
            message: "Character has no game system assigned",
            code: "no_game_system",
          },
        ],
      };
    try {
      validateCharacterData(character.gameSystem as GameSystem, character.data);
      return { isValid: true };
    } catch (error) {
      const validation = error as {
        errors?: Array<{ path: unknown[]; message: string; code: string }>;
        message?: string;
      };
      return {
        isValid: false,
        errors: validation.errors
          ? validation.errors.map((item) => ({
              path: item.path.join(".") || "root",
              message: item.message,
              code: item.code,
            }))
          : [
              {
                path: "unknown",
                message: validation.message || "Unknown validation error",
                code: "unknown",
              },
            ],
      };
    }
  }

  private async required(id: string) {
    const character = await this.characters.find(id);
    if (!character)
      throw new CharacterQueryError(404, "Not Found", "Character not found");
    return character;
  }
}
