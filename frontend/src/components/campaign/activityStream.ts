import {
  MessageType,
  PlatformRole,
  type DiceRollBreakdown,
  type DiceRolledEvent,
  type Message,
} from "@/types";

export type ActivityMode = "general" | "game" | "system";
export type ActivityCategory =
  | "conversation"
  | "rolls"
  | "characters"
  | "combat"
  | "scene"
  | "session"
  | "presence"
  | "extensions"
  | "system";

export const ACTIVITY_MODES: ReadonlyArray<{
  id: ActivityMode;
  label: string;
}> = [
  { id: "general", label: "General" },
  { id: "game", label: "Game Log" },
  { id: "system", label: "System" },
];

export const ACTIVITY_FILTERS: Record<
  ActivityMode,
  ReadonlyArray<{ id: ActivityCategory; label: string }>
> = {
  general: [
    { id: "conversation", label: "Conversation" },
    { id: "rolls", label: "Rolls" },
    { id: "characters", label: "Character actions" },
    { id: "scene", label: "Scene changes" },
    { id: "session", label: "Session events" },
    { id: "presence", label: "Presence" },
    { id: "extensions", label: "Extension activity" },
  ],
  game: [
    { id: "rolls", label: "Rolls" },
    { id: "characters", label: "Character actions" },
    { id: "combat", label: "Combat" },
    { id: "scene", label: "Scene changes" },
    { id: "session", label: "Session events" },
    { id: "extensions", label: "Extension activity" },
  ],
  system: [
    { id: "presence", label: "Presence" },
    { id: "session", label: "Session events" },
    { id: "extensions", label: "Extension activity" },
    { id: "system", label: "Other system events" },
  ],
};

export const DEFAULT_ACTIVITY_FILTERS: Record<
  ActivityMode,
  readonly ActivityCategory[]
> = {
  general: ["conversation", "rolls", "characters", "scene", "session"],
  game: ["rolls", "characters", "combat", "scene", "session", "extensions"],
  system: ["presence", "session", "extensions", "system"],
};

const PRESENCE_ACTIONS = new Set(["user.joined", "user.left"]);
const SESSION_ACTIONS = new Set([
  "session.started",
  "session.paused",
  "session.resumed",
  "session.ended",
]);

function activityKind(message: Message): string | null {
  const activity = message.metadata?.activity;
  return activity && typeof activity === "object" && typeof activity.kind === "string"
    ? activity.kind
    : null;
}

export function activityCategories(message: Message): Set<ActivityCategory> {
  if (message.type === MessageType.PLAYER || message.type === MessageType.DM) {
    return new Set(["conversation"]);
  }
  if (message.type === MessageType.DICE_ROLL) return new Set(["rolls"]);
  if (message.type === MessageType.CHARACTER_ACTION) {
    return new Set(["characters"]);
  }

  const categories = new Set<ActivityCategory>();
  const action = String(message.metadata?.action ?? "");
  const kind = activityKind(message);

  if (PRESENCE_ACTIONS.has(action)) categories.add("presence");
  else if (SESSION_ACTIONS.has(action) || kind === "session") categories.add("session");
  else if (kind === "narrative") categories.add("conversation");
  else if (kind === "mechanic") categories.add("combat");
  else if (
    kind === "scene" ||
    /^(vibe|map|scene|token|actor|character|initiative|atmosphere)\./.test(action)
  ) {
    categories.add("scene");
  } else {
    categories.add("system");
  }

  const source = message.metadata?.activity?.source;
  if (source === "extension" || typeof message.metadata?.activity?.extensionId === "string") {
    categories.add("extensions");
  }
  return categories;
}

export function messageMatchesActivityFilters(
  message: Message,
  filters: readonly ActivityCategory[],
): boolean {
  if (filters.length === 0) return false;
  const categories = activityCategories(message);
  return filters.some((filter) => categories.has(filter));
}

export function diceRollActivityMessage(
  data: DiceRolledEvent,
  campaignId: string,
): Message | null {
  if (!data.id) return null;
  return {
    id: data.id,
    campaignId,
    userId: data.userId,
    user: {
      id: data.userId,
      displayName: data.userName,
      email: "",
      platformRole: PlatformRole.USER,
      globalAssetManager: false,
      mfaEnabled: false,
      avatarUrl: null,
      bio: null,
      createdAt: data.timestamp,
      updatedAt: data.timestamp,
      lastLoginAt: null,
    },
    type: MessageType.DICE_ROLL,
    content: `${data.userName}${data.characterName ? ` (${data.characterName})` : ""} rolled ${data.expression}${data.purpose ? ` for ${data.purpose}` : ""}${data.secret ? " (SECRET)" : ""}`,
    metadata: {
      expression: data.expression,
      result: data.result,
      breakdown: data.breakdown,
      characterName: data.characterName,
      purpose: data.purpose,
      secret: Boolean(data.secret),
    },
    createdAt: data.timestamp,
  };
}

export function diceRollEventFromMessage(
  message: Message,
): DiceRolledEvent | null {
  if (
    message.type !== MessageType.DICE_ROLL ||
    typeof message.userId !== "string" ||
    !message.metadata
  ) {
    return null;
  }

  const { expression, result, breakdown, characterName, purpose, secret } =
    message.metadata;
  if (
    typeof expression !== "string" ||
    typeof result !== "number" ||
    !breakdown ||
    typeof breakdown !== "object" ||
    !Array.isArray((breakdown as DiceRollBreakdown).rolls) ||
    typeof (breakdown as DiceRollBreakdown).formula !== "string"
  ) {
    return null;
  }

  return {
    id: message.id,
    userId: message.userId,
    userName: message.user?.displayName || "Unknown User",
    characterName: typeof characterName === "string" ? characterName : null,
    expression,
    result,
    breakdown: breakdown as DiceRollBreakdown,
    purpose: typeof purpose === "string" ? purpose : null,
    timestamp: message.createdAt,
    secret: Boolean(secret),
  };
}

export function normalizeActivityFilters(
  stored: unknown,
): Record<ActivityMode, ActivityCategory[]> {
  const record = stored && typeof stored === "object" ? stored as Record<string, unknown> : {};
  return Object.fromEntries(
    ACTIVITY_MODES.map(({ id }) => {
      const allowed = new Set(ACTIVITY_FILTERS[id].map(({ id: filterId }) => filterId));
      const selected = Array.isArray(record[id])
        ? record[id].filter(
            (value): value is ActivityCategory =>
              typeof value === "string" && allowed.has(value as ActivityCategory),
          )
        : [...DEFAULT_ACTIVITY_FILTERS[id]];
      return [id, selected];
    }),
  ) as Record<ActivityMode, ActivityCategory[]>;
}
