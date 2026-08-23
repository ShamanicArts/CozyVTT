import { describe, expect, it } from "vitest";
import { MessageType, type Message } from "@/types";
import {
  activityCategories,
  diceRollActivityMessage,
  diceRollEventFromMessage,
  messageMatchesActivityFilters,
  normalizeActivityFilters,
} from "../activityStream";

function message(
  type: MessageType,
  metadata: Message["metadata"] = null,
): Message {
  return {
    id: "message-1",
    campaignId: "campaign-1",
    userId: null,
    type,
    content: "Event",
    metadata,
    createdAt: new Date().toISOString(),
  };
}

describe("activity stream semantics", () => {
  it("keeps ordinary and in-world actor speech in conversation", () => {
    expect(activityCategories(message(MessageType.PLAYER))).toEqual(
      new Set(["conversation"]),
    );
    expect(
      activityCategories(
        message(MessageType.PLAYER, { speakerName: "Ashfang" }),
      ),
    ).toEqual(new Set(["conversation"]));
  });

  it("classifies preserved connection events as presence", () => {
    const joined = message(MessageType.SYSTEM, { action: "user.joined" });
    expect(activityCategories(joined)).toEqual(new Set(["presence"]));
    expect(messageMatchesActivityFilters(joined, ["presence"])).toBe(true);
    expect(messageMatchesActivityFilters(joined, ["conversation"])).toBe(false);
  });

  it("projects persisted live rolls into the General roll filter", () => {
    const roll = diceRollActivityMessage(
      {
        id: "roll-message-1",
        userId: "user-1",
        userName: "Mira",
        characterName: "Mira Fen",
        expression: "1d20+3",
        result: 18,
        breakdown: {
          expression: "1d20+3",
          formula: "15 + 3",
          total: 18,
          rolls: [],
        },
        purpose: "Perception",
        timestamp: "2026-08-23T10:00:00.000Z",
      },
      "campaign-1",
    );
    expect(roll).toMatchObject({
      id: "roll-message-1",
      type: MessageType.DICE_ROLL,
      content: "Mira (Mira Fen) rolled 1d20+3 for Perception",
    });
    expect(messageMatchesActivityFilters(roll!, ["rolls"])).toBe(true);
  });

  it("ignores initiative-only dice broadcasts without a persisted message", () => {
    expect(
      diceRollActivityMessage(
        {
          userId: "system",
          userName: "Initiative",
          characterName: null,
          expression: "1d20",
          result: 12,
          breakdown: {
            expression: "1d20",
            formula: "12",
            total: 12,
            rolls: [],
          },
          purpose: null,
          timestamp: "2026-08-23T10:00:00.000Z",
        },
        "campaign-1",
      ),
    ).toBeNull();
  });

  it("restores persisted roll metadata for compact activity rendering", () => {
    const message = diceRollActivityMessage(
      {
        id: "roll-message-2",
        userId: "user-1",
        userName: "Mira",
        characterName: null,
        expression: "1d20+3",
        result: 6,
        breakdown: {
          expression: "1d20+3",
          formula: "3 + 3",
          total: 6,
          rolls: [
            {
              type: "dice",
              notation: "1d20",
              count: 1,
              sides: 20,
              results: [3],
              kept: [3],
              total: 3,
            },
            { type: "modifier", value: 3 },
          ],
        },
        purpose: null,
        timestamp: "2026-08-23T10:00:00.000Z",
      },
      "campaign-1",
    );

    expect(diceRollEventFromMessage(message!)).toMatchObject({
      id: "roll-message-2",
      userName: "Mira",
      expression: "1d20+3",
      result: 6,
      breakdown: { formula: "3 + 3" },
    });
  });

  it("falls back for malformed persisted roll metadata", () => {
    expect(
      diceRollEventFromMessage({
        ...message(MessageType.DICE_ROLL),
        userId: "user-1",
        metadata: { expression: "1d20+3", result: 6 },
      }),
    ).toBeNull();
  });

  it("lets extension scene actions appear through either semantic facet", () => {
    const extensionEvent = message(MessageType.SYSTEM, {
      action: "application.command.executed",
      activity: {
        kind: "scene",
        source: "extension",
        extensionId: "cozyvtt.agent",
      },
    });
    expect(activityCategories(extensionEvent)).toEqual(
      new Set(["scene", "extensions"]),
    );
    expect(messageMatchesActivityFilters(extensionEvent, ["scene"])).toBe(true);
    expect(messageMatchesActivityFilters(extensionEvent, ["extensions"])).toBe(
      true,
    );
  });

  it("drops unknown and invalid saved filters without losing valid choices", () => {
    expect(
      normalizeActivityFilters({
        general: ["conversation", "invalid"],
        game: "bad",
      }),
    ).toMatchObject({
      general: ["conversation"],
      system: ["presence", "session", "extensions", "system"],
    });
  });
});
