import type { Command } from "../application/commands/CommandBus";
import { productionApplicationHost } from "./productionApplicationHost";

export const productionTransportCommands = {
  dispatch<TCommand extends Command<TResult>, TResult>(
    command: TCommand,
  ): Promise<TResult> {
    const input = command as TCommand & Record<string, unknown>;
    const actor = isRecord(input.actor) ? input.actor : undefined;
    const principalId = firstString(
      actor?.userId,
      input.actorId,
      input.userId,
      input.ownerId,
      input.requesterId,
      input.invitedBy,
      input.createdById,
      input.uploadedById,
    );
    return productionApplicationHost.dispatch<Record<string, unknown>, TResult>({
      id: command.type,
      input,
      context: {
        principalType: "USER",
        principalId: principalId ?? "transport-system",
        campaignId: firstString(input.campaignId),
        origin: "TRANSPORT",
      },
    });
  },
};

function firstString(...values: unknown[]): string | undefined {
  return values.find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
