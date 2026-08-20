import { RealtimeSpiritRepository } from "../../ports/RealtimeSpiritRepository";
import { Command, CommandHandler } from "../commands/CommandBus";
export const SET_SPIRIT_LAYER_ENABLED = "spirit.layer.set-enabled" as const;
export const SET_SPIRIT_TOKEN_VISIBLE = "spirit.token.set-visible" as const;
export class RealtimeSpiritError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RealtimeSpiritError";
  }
}
export interface SetSpiritLayerEnabledCommand extends Command<void> {
  readonly type: typeof SET_SPIRIT_LAYER_ENABLED;
  readonly campaignId: string;
  readonly visible: unknown;
}
export interface SetSpiritTokenVisibleCommand extends Command<{
  token: Record<string, unknown>;
}> {
  readonly type: typeof SET_SPIRIT_TOKEN_VISIBLE;
  readonly campaignId: string;
  readonly mapId: unknown;
  readonly tokenId: unknown;
  readonly visible: unknown;
}
export class SetSpiritLayerEnabled implements CommandHandler<
  SetSpiritLayerEnabledCommand,
  void
> {
  constructor(private readonly repository: RealtimeSpiritRepository) {}
  async execute(c: SetSpiritLayerEnabledCommand) {
    if (typeof c.visible !== "boolean")
      throw new RealtimeSpiritError("visible must be a boolean");
    await this.repository.setSpiritLayerEnabled(c.campaignId, c.visible);
  }
}
export class SetSpiritTokenVisible implements CommandHandler<
  SetSpiritTokenVisibleCommand,
  { token: Record<string, unknown> }
> {
  constructor(private readonly repository: RealtimeSpiritRepository) {}
  async execute(
    c: SetSpiritTokenVisibleCommand,
  ): Promise<{ token: Record<string, unknown> }> {
    if (
      !c.mapId ||
      typeof c.mapId !== "string" ||
      !c.tokenId ||
      typeof c.tokenId !== "string" ||
      typeof c.visible !== "boolean"
    )
      throw new RealtimeSpiritError(
        "mapId, tokenId, and visible (boolean) required",
      );
    const map = await this.repository.findMap(c.mapId);
    if (!map || map.campaignId !== c.campaignId)
      throw new RealtimeSpiritError("Map not found");
    const tokens = (Array.isArray(map.tokens) ? map.tokens : []) as Record<
      string,
      unknown
    >[];
    const index = tokens.findIndex((t) => t.id === c.tokenId);
    if (index === -1) throw new RealtimeSpiritError("Token not found");
    const token = { ...tokens[index], visible: c.visible };
    const updated = [...tokens];
    updated[index] = token;
    await this.repository.updateMapTokens(c.mapId, map.revision, updated);
    return { token };
  }
}
