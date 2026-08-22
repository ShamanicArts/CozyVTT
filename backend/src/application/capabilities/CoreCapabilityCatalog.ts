import { IMPORT_REMOTE_MAP } from "../maps/RemoteMapImportCommands";
import type {
  ExtensionPermission,
  JsonSchema,
} from "../../extensions/contracts";
import {
  PUBLIC_ADD_TO_COMBAT,
  PUBLIC_ADJUST_CHARACTER_HP,
  PUBLIC_CREATE_CHARACTER,
  PUBLIC_END_COMBAT,
  PUBLIC_MOVE_ACTOR,
  PUBLIC_NEXT_TURN,
  PUBLIC_REMOVE_FROM_COMBAT,
  PUBLIC_ROLL_AS_ACTOR,
  PUBLIC_SPAWN_ACTOR,
  PUBLIC_SPEAK_AS_ACTOR,
  PUBLIC_START_COMBAT,
  PUBLIC_UPDATE_ACTOR,
} from "./CapabilityGameplayCommands";
import {
  PUBLIC_ACTIVATE_MAP,
  PUBLIC_ADD_LIGHT,
  PUBLIC_ADD_WALL,
  PUBLIC_APPLY_FOG,
  PUBLIC_END_SESSION,
  PUBLIC_PAUSE_SESSION,
  PUBLIC_REMOVE_LIGHT,
  PUBLIC_REMOVE_WALL,
  PUBLIC_RESUME_SESSION,
  PUBLIC_SET_ATMOSPHERE_AUDIO,
  PUBLIC_SET_ATMOSPHERE_EFFECT,
  PUBLIC_SET_LIGHTING,
  PUBLIC_SET_VIBE,
  PUBLIC_START_SESSION,
  PUBLIC_UPDATE_LIGHT,
  PUBLIC_UPDATE_WALL,
} from "./CapabilityGmCommands";

export const PUBLIC_CAPABILITY_EXTENSION_ID = "cozyvtt.public-capabilities";
export type CapabilityOperatingRole = "GM" | "PLAYER" | "NPC" | "SYSTEM";

export interface CoreCapabilityCommand {
  id: string;
  title: string;
  description: string;
  risk: "read" | "medium" | "high";
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  requiresApproval: boolean;
  write: boolean;
  openWorld?: boolean;
  /** Roles for which this capability is useful; domain authorization still wins. */
  operatingRoles: readonly CapabilityOperatingRole[];
}

export interface PublicCoreCommandDescriptor extends CoreCapabilityCommand {
  version: "1";
  requiredPermissions: readonly ExtensionPermission[];
  approvalRequired: boolean;
  idempotencyRequired: boolean;
}

const campaignId = { type: "string", minLength: 1, maxLength: 128 };
const identifier = { type: "string", minLength: 1, maxLength: 128 };
const positionProperties = {
  x: { type: "number", minimum: 0 },
  y: { type: "number", minimum: 0 },
};
const actorOutput: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    type: { type: "string" },
    mapId: { type: "string" },
    position: {
      type: "object",
      properties: positionProperties,
      required: ["x", "y"],
      additionalProperties: false,
    },
    controlledBy: { type: ["string", "null"] },
    hp: { type: ["object", "null"] },
    conditions: { type: "array", items: { type: "string" } },
  },
  required: [
    "id",
    "name",
    "type",
    "mapId",
    "position",
    "controlledBy",
    "hp",
    "conditions",
  ],
  additionalProperties: false,
};
const combatOutput: JsonSchema = {
  type: "object",
  properties: {
    state: { type: "object" },
    roll: { type: "object" },
  },
  required: ["state"],
  additionalProperties: false,
};
const wallSchema: JsonSchema = {
  type: "object",
  properties: {
    id: identifier,
    x1: { type: "number" },
    y1: { type: "number" },
    x2: { type: "number" },
    y2: { type: "number" },
    type: {
      enum: ["wall", "door-closed", "door-open", "door-locked", "window"],
    },
  },
  required: ["id", "x1", "y1", "x2", "y2", "type"],
  additionalProperties: false,
};
const lightSchema: JsonSchema = {
  type: "object",
  properties: {
    id: identifier,
    x: { type: "number" },
    y: { type: "number" },
    brightRadius: { type: "number", minimum: 0 },
    dimRadius: { type: "number", minimum: 0 },
    color: { type: "string", minLength: 1, maxLength: 64 },
    enabled: { type: "boolean" },
  },
  required: ["id", "x", "y", "brightRadius", "dimRadius", "color", "enabled"],
  additionalProperties: false,
};

export const CORE_PUBLIC_CAPABILITIES: readonly CoreCapabilityCommand[] = [
  {
    id: PUBLIC_SPAWN_ACTOR,
    title: "Create a player or NPC actor",
    description:
      "Place a live player or NPC actor on a map. DMs may create either; players may create only an actor controlled by themselves.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        campaignId,
        mapId: identifier,
        name: { type: "string", minLength: 1, maxLength: 200 },
        actorType: { enum: ["player", "npc"] },
        ...positionProperties,
        controlledByUserId: identifier,
        imageUrl: { type: "string", maxLength: 2048 },
        disposition: { enum: ["friendly", "neutral", "hostile"] },
        hp: {
          type: "object",
          properties: {
            current: { type: "number", minimum: 0 },
            max: { type: "number", minimum: 0 },
            temp: { type: "number", minimum: 0 },
          },
          required: ["current", "max"],
          additionalProperties: false,
        },
        notes: { type: "string", maxLength: 4000 },
        visible: { type: "boolean" },
      },
      required: ["campaignId", "mapId", "name", "actorType", "x", "y"],
      additionalProperties: false,
    },
    outputSchema: actorOutput,
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "PLAYER", "SYSTEM"],
  },
  {
    id: PUBLIC_UPDATE_ACTOR,
    title: "Update a player or NPC actor",
    description:
      "Change actor state such as HP, conditions, visibility, name, notes, disposition, or controller. Existing campaign-role rules are enforced.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        campaignId,
        mapId: identifier,
        tokenId: identifier,
        updates: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 200 },
            imageUrl: { type: "string", maxLength: 2048 },
            type: { enum: ["player", "npc", "object"] },
            disposition: { enum: [null, "friendly", "neutral", "hostile"] },
            visible: { type: "boolean" },
            controlledBy: { type: ["string", "null"] },
            rotation: { type: "number" },
            conditions: {
              type: "array",
              items: { type: "string", maxLength: 100 },
              maxItems: 100,
            },
            hp: {
              type: ["object", "null"],
              properties: {
                current: { type: "number", minimum: 0 },
                max: { type: "number", minimum: 0 },
                temp: { type: "number", minimum: 0 },
              },
              required: ["current", "max"],
              additionalProperties: false,
            },
            showHpBar: { type: "boolean" },
            notes: { type: "string", maxLength: 4000 },
            metadata: { type: "object" },
          },
          minProperties: 1,
          additionalProperties: false,
        },
      },
      required: ["campaignId", "mapId", "tokenId", "updates"],
      additionalProperties: false,
    },
    outputSchema: actorOutput,
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "PLAYER", "NPC"],
  },
  {
    id: PUBLIC_MOVE_ACTOR,
    title: "Move a player or NPC actor",
    description:
      "Move a controlled actor to a grid position and update every connected client.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        campaignId,
        mapId: identifier,
        tokenId: identifier,
        ...positionProperties,
      },
      required: ["campaignId", "mapId", "tokenId", "x", "y"],
      additionalProperties: false,
    },
    outputSchema: actorOutput,
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "PLAYER", "NPC"],
  },
  {
    id: PUBLIC_SPEAK_AS_ACTOR,
    title: "Speak as a player or NPC actor",
    description:
      "Send an in-world chat message using a controlled actor's name while retaining the controlling identity for audit.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        campaignId,
        mapId: identifier,
        tokenId: identifier,
        content: { type: "string", minLength: 1, maxLength: 2000 },
      },
      required: ["campaignId", "mapId", "tokenId", "content"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "PLAYER", "NPC"],
  },
  {
    id: PUBLIC_ROLL_AS_ACTOR,
    title: "Roll dice as a player or NPC actor",
    description:
      "Make a persisted public or secret dice roll in the name of a controlled actor.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        campaignId,
        mapId: identifier,
        tokenId: identifier,
        expression: { type: "string", minLength: 1, maxLength: 200 },
        purpose: { type: "string", maxLength: 500 },
        secret: { type: "boolean" },
      },
      required: ["campaignId", "mapId", "tokenId", "expression"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "PLAYER", "NPC"],
  },
  {
    id: PUBLIC_CREATE_CHARACTER,
    title: "Create a campaign character",
    description:
      "Create a real campaign character owned by the connected player, or by a selected campaign member when connected as GM.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        campaignId,
        name: { type: "string", minLength: 1, maxLength: 200 },
        data: { type: "object" },
        gameSystem: {
          enum: [
            "DND_5E",
            "PATHFINDER_2E",
            "SHADOWRUN_6E",
            "CALL_OF_CTHULHU_7E",
          ],
        },
        tokenImageUrl: { type: "string", maxLength: 2048 },
        ownerUserId: identifier,
      },
      required: ["campaignId", "name", "data"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: { character: { type: "object" } },
      required: ["character"],
      additionalProperties: false,
    },
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "PLAYER"],
  },
  {
    id: PUBLIC_ADJUST_CHARACTER_HP,
    title: "Adjust a character's HP",
    description:
      "Apply healing or damage to a campaign character controlled by the connected player, or any character when connected as DM.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        campaignId,
        characterId: identifier,
        delta: { type: "number" },
      },
      required: ["campaignId", "characterId", "delta"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        current: { type: "number" },
        max: { type: "number" },
        temp: { type: "number" },
      },
      required: ["current", "max", "temp"],
      additionalProperties: false,
    },
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "PLAYER"],
  },
  {
    id: PUBLIC_ADD_TO_COMBAT,
    title: "Add an actor to combat",
    description:
      "As GM, add an actor to initiative and optionally roll its initiative immediately.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        campaignId,
        mapId: identifier,
        tokenId: identifier,
        initiativeExpression: { type: "string", minLength: 1, maxLength: 200 },
      },
      required: ["campaignId", "mapId", "tokenId"],
      additionalProperties: false,
    },
    outputSchema: combatOutput,
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM"],
  },
  {
    id: PUBLIC_REMOVE_FROM_COMBAT,
    title: "Remove an actor from combat",
    description: "As GM, remove an actor from the initiative tracker.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: { campaignId, tokenId: identifier },
      required: ["campaignId", "tokenId"],
      additionalProperties: false,
    },
    outputSchema: combatOutput,
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM"],
  },
  ...[
    [
      PUBLIC_START_COMBAT,
      "Start combat",
      "Start the initiative tracker as GM.",
    ],
    [
      PUBLIC_NEXT_TURN,
      "Advance combat",
      "Advance to the next actor and round as GM.",
    ],
    [PUBLIC_END_COMBAT, "End combat", "End the current combat as GM."],
  ].map(([id, title, description]) => ({
    id,
    title,
    description,
    risk: "medium" as const,
    inputSchema: {
      type: "object",
      properties: { campaignId },
      required: ["campaignId"],
      additionalProperties: false,
    },
    outputSchema: combatOutput,
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM"] as const,
  })),
  {
    id: PUBLIC_ACTIVATE_MAP,
    title: "Activate a campaign map",
    description:
      "Make an existing campaign map current and synchronize it to connected players.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: { campaignId, mapId: identifier },
      required: ["campaignId", "mapId"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "SYSTEM"],
  },
  ...[
    [
      PUBLIC_ADD_WALL,
      "Add a scene wall",
      "Add a wall, door, or window segment to a map.",
    ],
    [
      PUBLIC_UPDATE_WALL,
      "Update a scene wall",
      "Move or change a map wall, door, or window segment.",
    ],
  ].map(([id, title, description]) => ({
    id,
    title,
    description,
    risk: "medium" as const,
    inputSchema: {
      type: "object",
      properties: { campaignId, mapId: identifier, segment: wallSchema },
      required: ["campaignId", "mapId", "segment"],
      additionalProperties: false,
    },
    outputSchema: { type: "array", items: wallSchema },
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "SYSTEM"] as const,
  })),
  {
    id: PUBLIC_REMOVE_WALL,
    title: "Remove a scene wall",
    description: "Remove a wall, door, or window segment from a map.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: { campaignId, mapId: identifier, segmentId: identifier },
      required: ["campaignId", "mapId", "segmentId"],
      additionalProperties: false,
    },
    outputSchema: { type: "array", items: wallSchema },
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "SYSTEM"],
  },
  {
    id: PUBLIC_APPLY_FOG,
    title: "Control fog of war",
    description:
      "Reveal or hide selected fog cells, or reveal or hide the complete map.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        campaignId,
        mapId: identifier,
        operation: {
          type: "object",
          properties: {
            op: { enum: ["reveal", "hide", "reveal_all", "hide_all"] },
            cells: {
              type: "array",
              items: { type: "integer", minimum: 0 },
              maxItems: 100000,
            },
          },
          required: ["op"],
          additionalProperties: false,
        },
      },
      required: ["campaignId", "mapId", "operation"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "SYSTEM"],
  },
  ...[
    [
      PUBLIC_ADD_LIGHT,
      "Add a scene light",
      "Add a dynamic light source to a map.",
    ],
    [
      PUBLIC_UPDATE_LIGHT,
      "Update a scene light",
      "Move or modify a dynamic light source.",
    ],
  ].map(([id, title, description]) => ({
    id,
    title,
    description,
    risk: "medium" as const,
    inputSchema: {
      type: "object",
      properties: { campaignId, mapId: identifier, light: lightSchema },
      required: ["campaignId", "mapId", "light"],
      additionalProperties: false,
    },
    outputSchema: { type: "array", items: lightSchema },
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "SYSTEM"] as const,
  })),
  {
    id: PUBLIC_REMOVE_LIGHT,
    title: "Remove a scene light",
    description: "Remove a dynamic light source from a map.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: { campaignId, mapId: identifier, lightId: identifier },
      required: ["campaignId", "mapId", "lightId"],
      additionalProperties: false,
    },
    outputSchema: { type: "array", items: lightSchema },
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "SYSTEM"],
  },
  {
    id: PUBLIC_SET_LIGHTING,
    title: "Set dynamic lighting",
    description: "Enable or disable dynamic lighting for a map.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        campaignId,
        mapId: identifier,
        enabled: { type: "boolean" },
      },
      required: ["campaignId", "mapId", "enabled"],
      additionalProperties: false,
    },
    outputSchema: { type: "boolean" },
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "SYSTEM"],
  },
  {
    id: PUBLIC_SET_ATMOSPHERE_AUDIO,
    title: "Set campaign atmosphere audio",
    description: "Play, change, or clear a campaign audio asset.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        campaignId,
        assetId: { type: ["string", "null"] },
        volume: { type: "number", minimum: 0, maximum: 1 },
        loop: { type: "boolean" },
      },
      required: ["campaignId", "assetId"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "SYSTEM"],
  },
  {
    id: PUBLIC_SET_VIBE,
    title: "Set campaign vibe period",
    description: "Change the active configured campaign vibe period.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        campaignId,
        period: { type: "string", minLength: 1, maxLength: 200 },
      },
      required: ["campaignId", "period"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "SYSTEM"],
  },
  {
    id: PUBLIC_START_SESSION,
    title: "Start a campaign session",
    description: "Start a new campaign session as GM.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: { campaignId },
      required: ["campaignId"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "SYSTEM"],
  },
  {
    id: PUBLIC_PAUSE_SESSION,
    title: "Pause a campaign session",
    description: "Pause an active session and save its current state.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: { campaignId, sessionId: identifier },
      required: ["campaignId", "sessionId"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "SYSTEM"],
  },
  {
    id: PUBLIC_RESUME_SESSION,
    title: "Resume a campaign session",
    description: "Restore and resume the last saved campaign session.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: { campaignId },
      required: ["campaignId"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "SYSTEM"],
  },
  {
    id: PUBLIC_END_SESSION,
    title: "End a campaign session",
    description: "End an active session, optionally saving state and notes.",
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        campaignId,
        sessionId: identifier,
        saveState: { type: "boolean" },
        notes: { type: "string", maxLength: 2000 },
      },
      required: ["campaignId", "sessionId"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "SYSTEM"],
  },
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
    requiresApproval: false,
    write: true,
    openWorld: true,
    operatingRoles: ["GM", "SYSTEM"],
  },
  {
    id: PUBLIC_SET_ATMOSPHERE_EFFECT,
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
    requiresApproval: false,
    write: true,
    operatingRoles: ["GM", "SYSTEM"],
  },
];

export function findCoreCapabilityCommand(
  commandId: unknown,
): PublicCoreCommandDescriptor | undefined {
  return typeof commandId === "string"
    ? PUBLIC_CORE_COMMAND_DESCRIPTORS.find(
        (command) => command.id === commandId,
      )
    : undefined;
}

export function publicCoreCommandDescriptor(
  command: CoreCapabilityCommand,
): PublicCoreCommandDescriptor {
  return {
    ...command,
    version: "1",
    requiredPermissions: coreCommandPermissions(command.id),
    approvalRequired: command.requiresApproval,
    idempotencyRequired: command.write,
  };
}

export function listPublicCoreCommandDescriptors(): PublicCoreCommandDescriptor[] {
  return [...PUBLIC_CORE_COMMAND_DESCRIPTORS];
}

export const PUBLIC_CORE_COMMAND_DESCRIPTORS: readonly PublicCoreCommandDescriptor[] =
  CORE_PUBLIC_CAPABILITIES.map(publicCoreCommandDescriptor);

function coreCommandPermissions(
  commandId: string,
): readonly ExtensionPermission[] {
  if (commandId === IMPORT_REMOTE_MAP) {
    return ["maps.write", "assets.write", "network.fetch"];
  }
  if (commandId === PUBLIC_SPEAK_AS_ACTOR) return ["chat.write"];
  if (commandId === PUBLIC_ROLL_AS_ACTOR) return ["dice.roll"];
  if (
    commandId.startsWith("vtt.actor.") ||
    commandId.startsWith("vtt.combat.")
  ) {
    return ["tokens.write"];
  }
  if (commandId.startsWith("vtt.character.")) return ["characters.write"];
  if (commandId.startsWith("vtt.map.") || commandId.startsWith("vtt.scene.")) {
    return ["maps.write"];
  }
  if (
    commandId.startsWith("vtt.campaign.") ||
    commandId.startsWith("vtt.session.") ||
    commandId.startsWith("vtt.atmosphere.")
  ) {
    return ["campaign.write"];
  }
  throw new Error(`Core command ${commandId} has no plugin permission mapping`);
}
