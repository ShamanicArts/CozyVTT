import { SET_ATMOSPHERE_EFFECT } from "../campaigns/RealtimeCampaignCommands";
import type { JsonSchema } from "../../extensions/contracts";

export const CORE_AGENT_EXTENSION_ID = "cozyvtt.core-agent";

export interface CoreAgentCommand {
  id: string;
  title: string;
  description: string;
  risk: "read" | "medium" | "high";
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  requiresConfirmation: boolean;
  write: boolean;
}

export const CORE_AGENT_COMMANDS: readonly CoreAgentCommand[] = [
  {
    id: SET_ATMOSPHERE_EFFECT,
    title: "Set campaign atmosphere effect",
    description:
      "Set or clear the active visual atmosphere effect for a campaign.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", minLength: 1, maxLength: 128 },
        effect: {
          enum: [null, "rain", "mist", "leaves", "sparkles", "snow", "wind"],
        },
      },
      required: ["campaignId", "effect"],
      additionalProperties: false,
    },
    outputSchema: {
      enum: [null, "rain", "mist", "leaves", "sparkles", "snow", "wind"],
    },
    requiresConfirmation: true,
    write: true,
  },
];

export function findCoreAgentCommand(
  commandId: unknown,
): CoreAgentCommand | undefined {
  return typeof commandId === "string"
    ? CORE_AGENT_COMMANDS.find((command) => command.id === commandId)
    : undefined;
}
