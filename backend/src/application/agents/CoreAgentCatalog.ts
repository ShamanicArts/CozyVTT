import { SET_ATMOSPHERE_EFFECT } from "../campaigns/RealtimeCampaignCommands";
import { IMPORT_REMOTE_MAP } from "../maps/RemoteMapImportCommands";
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
  openWorld?: boolean;
}

export const CORE_AGENT_COMMANDS: readonly CoreAgentCommand[] = [
  {
    id: IMPORT_REMOTE_MAP,
    title: "Import a remote battle map",
    description:
      "Download a public HTTP image, create a campaign map, and optionally make it active.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", minLength: 1, maxLength: 128 },
        sourceUrl: { type: "string", minLength: 8, maxLength: 2048 },
        name: { type: "string", minLength: 1, maxLength: 200 },
        width: { type: "integer", minimum: 1, maximum: 500 },
        height: { type: "integer", minimum: 1, maximum: 500 },
        gridSize: { type: "integer", minimum: 1, maximum: 512 },
        feetPerSquare: { type: "integer", minimum: 1, maximum: 100 },
        diagonalRule: { enum: ["flat", "alternating"] },
        activate: { type: "boolean" },
        description: { type: "string", maxLength: 2000 },
        tags: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 80 },
          maxItems: 30,
        },
      },
      required: [
        "campaignId",
        "sourceUrl",
        "name",
        "width",
        "height",
        "gridSize",
      ],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        assetId: { type: "string" },
        mapId: { type: "string" },
        name: { type: "string" },
        imageUrl: { type: "string" },
        width: { type: "number" },
        height: { type: "number" },
        gridSize: { type: "number" },
        active: { type: "boolean" },
      },
      required: [
        "assetId",
        "mapId",
        "name",
        "imageUrl",
        "width",
        "height",
        "gridSize",
        "active",
      ],
      additionalProperties: false,
    },
    requiresConfirmation: false,
    write: true,
    openWorld: true,
  },
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
