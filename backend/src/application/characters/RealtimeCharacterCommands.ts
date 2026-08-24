import { RealtimeCharacterRepository } from "../../ports/RealtimeCharacterRepository";
import { Command, CommandHandler } from "../commands/CommandBus";
export const UPDATE_CHARACTER_HP = "character.hp.update" as const;
export class RealtimeCharacterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RealtimeCharacterError";
  }
}
export interface UpdateCharacterHpCommand extends Command<{
  current: number;
  max: number;
  temp: number;
}> {
  readonly type: typeof UPDATE_CHARACTER_HP;
  readonly campaignId: string;
  readonly characterId: unknown;
  readonly delta: unknown;
  readonly userId: string;
  readonly isDm: boolean;
}
export class UpdateCharacterHp implements CommandHandler<
  UpdateCharacterHpCommand,
  { current: number; max: number; temp: number }
> {
  constructor(private readonly repository: RealtimeCharacterRepository) {}
  async execute(
    command: UpdateCharacterHpCommand,
  ): Promise<{ current: number; max: number; temp: number }> {
    if (
      !command.characterId ||
      typeof command.characterId !== "string" ||
      typeof command.delta !== "number" ||
      !Number.isFinite(command.delta)
    )
      throw new RealtimeCharacterError(
        "characterId (string) and delta (number) are required",
      );
    const character = await this.repository.findCharacter(command.characterId);
    if (!character) throw new RealtimeCharacterError("Character not found");
    if (
      !(await this.repository.characterMembership(
        command.campaignId,
        command.characterId,
      ))
    )
      throw new RealtimeCharacterError("Character is not in this campaign");
    if (character.userId !== command.userId && !command.isDm)
      throw new RealtimeCharacterError(
        "You do not have permission to update this character's HP",
      );
    const data = character.data as Record<string, unknown>;
    let current: number;
    let max: number;
    let temp: number;
    if (
      character.gameSystem === "DND_5E" ||
      character.gameSystem === "PATHFINDER_2E"
    ) {
      if (!isRecord(data.hp) || typeof data.hp.maximum !== "number")
        throw new RealtimeCharacterError("Character does not have HP tracking");
      max = data.hp.maximum;
      temp = typeof data.hp.temporary === "number" ? data.hp.temporary : 0;
      current = Math.max(
        0,
        Math.min(
          max,
          (typeof data.hp.current === "number" ? data.hp.current : max) +
            command.delta,
        ),
      );
      data.hp.current = current;
    } else if (character.gameSystem === "CALL_OF_CTHULHU_7E") {
      if (
        !isRecord(data.derivedStats) ||
        !isRecord(data.derivedStats.hp) ||
        typeof data.derivedStats.hp.maximum !== "number"
      )
        throw new RealtimeCharacterError("Character does not have HP tracking");
      max = data.derivedStats.hp.maximum;
      temp = 0;
      current = Math.max(
        0,
        Math.min(
          max,
          (typeof data.derivedStats.hp.current === "number"
            ? data.derivedStats.hp.current
            : max) + command.delta,
        ),
      );
      data.derivedStats.hp.current = current;
    } else
      throw new RealtimeCharacterError(
        "HP tracking not supported for this game system",
      );
    await this.repository.updateCharacterData(command.characterId, data);
    return { current, max, temp };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
