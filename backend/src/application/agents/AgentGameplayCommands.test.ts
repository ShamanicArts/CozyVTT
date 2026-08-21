import { CommandBus } from "../commands/CommandBus";
import {
  CREATE_MAP_TOKEN,
  UPDATE_MAP_TOKEN,
} from "../mapTokens/MapTokenMutations";
import { FINALIZE_TOKEN_MOVE, START_TOKEN_MOVE } from "../tokens/TokenMovement";
import { SEND_CHAT_MESSAGE } from "../chat/SendChatMessage";
import { ROLL_DICE } from "../dice/RollDice";
import {
  ADD_INITIATIVE_COMBATANT,
  ADVANCE_INITIATIVE_TURN,
  END_INITIATIVE_COMBAT,
  START_INITIATIVE_COMBAT,
} from "../initiative/InitiativeCommands";
import { CREATE_CHARACTER } from "../characters/CharacterMutations";
import type {
  AgentGameplayEventPublisher,
  AgentGameplayMembership,
  AgentGameplayRole,
} from "../../ports/AgentGameplay";
import {
  AGENT_ADD_TO_COMBAT,
  AGENT_MOVE_ACTOR,
  AGENT_SPAWN_ACTOR,
  AGENT_SPEAK_AS_ACTOR,
  AGENT_START_COMBAT,
  AddAgentCombatant,
  AgentGameplayError,
  MoveAgentActor,
  SpawnAgentActor,
  SpeakAsAgentActor,
  StartAgentCombat,
  CreateAgentCharacter,
  AGENT_CREATE_CHARACTER,
} from "./AgentGameplayCommands";

const token = {
  id: "token-1",
  characterId: null,
  name: "Ashfang",
  imageUrl: "",
  position: { x: 3, y: 4 },
  size: { width: 1, height: 1 },
  layer: "token" as const,
  visible: true,
  controlledBy: null,
  rotation: 0,
  conditions: [],
  metadata: {},
  type: "npc",
  disposition: "hostile",
  hp: { current: 18, max: 18, temp: 0 },
  showHpBar: true,
  notes: "",
  initiative: null,
  displayMode: "pog" as const,
  statBlock: null,
  creatureTemplateId: null,
};
const map = {
  id: "map-1",
  campaignId: "campaign-1",
  tokens: [token],
};
const state = {
  active: false,
  round: 0,
  currentTokenId: null,
  combatants: [],
};

function fixture(role: AgentGameplayRole = "DM") {
  const bus = new CommandBus();
  const dispatched: unknown[] = [];
  const register = (type: string, output: unknown) =>
    bus.register(type, {
      execute: async (command: unknown) => {
        dispatched.push(command);
        return typeof output === "function"
          ? (output as (value: unknown) => unknown)(command)
          : output;
      },
    });
  register(CREATE_MAP_TOKEN, { token, map });
  register(UPDATE_MAP_TOKEN, { token, map });
  register(START_TOKEN_MOVE, { token, map });
  register(FINALIZE_TOKEN_MOVE, { token, map, tokens: [token] });
  register(SEND_CHAT_MESSAGE, (command: any) => ({
    id: "message-1",
    userId: command.userId,
    userName: command.speakerName,
    content: command.content,
    type: "PLAYER",
    timestamp: "2026-08-21T12:00:00.000Z",
  }));
  register(ROLL_DICE, {});
  register(ADD_INITIATIVE_COMBATANT, state);
  register(START_INITIATIVE_COMBAT, { ...state, active: true, round: 1 });
  register(ADVANCE_INITIATIVE_TURN, state);
  register(END_INITIATIVE_COMBAT, state);
  register(CREATE_CHARACTER, { character: { id: "character-1" } });
  const memberships: AgentGameplayMembership = {
    role: async (userId) =>
      userId === "outsider" ? null : userId === "user-1" ? role : "PLAYER",
  };
  const events: jest.Mocked<AgentGameplayEventPublisher> = {
    syncMap: jest.fn(async (_campaignId, _map) => undefined),
    actorMoved: jest.fn(async (_campaignId, _movedBy, _result) => undefined),
    rosterUpdated: jest.fn(async (_campaignId, _payload) => undefined),
    characterHpUpdated: jest.fn(
      async (_campaignId, _characterId, _hp) => undefined,
    ),
    chatMessage: jest.fn(async (_campaignId, _message) => undefined),
    diceRolled: jest.fn(async (_campaignId, _roll) => undefined),
    initiativeChanged: jest.fn(async (_campaignId, _state, _roll) => undefined),
  };
  return { bus, dispatched, memberships, events };
}

describe("agent gameplay commands", () => {
  it("lets a DM create an NPC through the shared token command and live map port", async () => {
    const { bus, dispatched, memberships, events } = fixture();
    const result = await new SpawnAgentActor(bus, memberships, events).execute({
      type: AGENT_SPAWN_ACTOR,
      campaignId: "campaign-1",
      actorId: "user-1",
      mapId: "map-1",
      name: "Ashfang",
      actorType: "npc",
      x: 3,
      y: 4,
      hp: { current: 18, max: 18 },
    });

    expect(result).toMatchObject({ id: "token-1", name: "Ashfang" });
    expect(dispatched[0]).toMatchObject({
      type: CREATE_MAP_TOKEN,
      campaignId: "campaign-1",
      data: {
        name: "Ashfang",
        type: "npc",
        position: { x: 3, y: 4 },
        metadata: { agentCreated: true },
      },
    });
    expect(events.syncMap).toHaveBeenCalledWith("campaign-1", map);
  });

  it("allows a player to create only a self-controlled player actor", async () => {
    const player = fixture("PLAYER");
    await new SpawnAgentActor(
      player.bus,
      player.memberships,
      player.events,
    ).execute({
      type: AGENT_SPAWN_ACTOR,
      campaignId: "campaign-1",
      actorId: "user-1",
      mapId: "map-1",
      name: "Mira",
      actorType: "player",
      x: 1,
      y: 2,
    });
    expect(player.dispatched[0]).toMatchObject({
      data: { type: "player", controlledBy: "user-1" },
    });
    await expect(
      new SpawnAgentActor(
        player.bus,
        player.memberships,
        player.events,
      ).execute({
        type: AGENT_SPAWN_ACTOR,
        campaignId: "campaign-1",
        actorId: "user-1",
        mapId: "map-1",
        name: "Goblin",
        actorType: "npc",
        x: 1,
        y: 2,
      }),
    ).rejects.toThrow("Only a DM can create NPC actors");
  });

  it("moves and speaks as an authorized actor with live publication", async () => {
    const { bus, dispatched, memberships, events } = fixture();
    await new MoveAgentActor(bus, memberships, events).execute({
      type: AGENT_MOVE_ACTOR,
      campaignId: "campaign-1",
      actorId: "user-1",
      mapId: "map-1",
      tokenId: "token-1",
      x: 8,
      y: 9,
    });
    const message = await new SpeakAsAgentActor(
      bus,
      memberships,
      events,
    ).execute({
      type: AGENT_SPEAK_AS_ACTOR,
      campaignId: "campaign-1",
      actorId: "user-1",
      mapId: "map-1",
      tokenId: "token-1",
      content: "The gate is sealed.",
    });

    expect(dispatched).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: FINALIZE_TOKEN_MOVE,
          position: { x: 8, y: 9 },
        }),
        expect.objectContaining({
          type: SEND_CHAT_MESSAGE,
          speakerName: "Ashfang",
        }),
      ]),
    );
    expect(message.userName).toBe("Ashfang");
    expect(events.actorMoved).toHaveBeenCalled();
    expect(events.chatMessage).toHaveBeenCalledWith("campaign-1", message);
  });

  it("creates a real player character for the delegated campaign member", async () => {
    const player = fixture("PLAYER");
    const result = await new CreateAgentCharacter(
      player.bus,
      player.memberships,
      player.events,
    ).execute({
      type: AGENT_CREATE_CHARACTER,
      campaignId: "campaign-1",
      actorId: "user-1",
      name: "Mira",
      data: {},
    });
    expect(result).toEqual({ character: { id: "character-1" } });
    expect(player.dispatched).toContainEqual(
      expect.objectContaining({
        type: CREATE_CHARACTER,
        userId: "user-1",
        input: expect.objectContaining({
          campaignId: "campaign-1",
          name: "Mira",
        }),
      }),
    );
    expect(player.events.rosterUpdated).toHaveBeenCalled();
  });

  it("lets only a DM drive initiative and publishes every state", async () => {
    const dm = fixture();
    await new AddAgentCombatant(dm.bus, dm.memberships, dm.events).execute({
      type: AGENT_ADD_TO_COMBAT,
      campaignId: "campaign-1",
      actorId: "user-1",
      mapId: "map-1",
      tokenId: "token-1",
    });
    await new StartAgentCombat(dm.bus, dm.memberships, dm.events).execute({
      type: AGENT_START_COMBAT,
      campaignId: "campaign-1",
      actorId: "user-1",
    });
    expect(dm.events.initiativeChanged).toHaveBeenCalledTimes(2);

    const player = fixture("PLAYER");
    await expect(
      new StartAgentCombat(
        player.bus,
        player.memberships,
        player.events,
      ).execute({
        type: AGENT_START_COMBAT,
        campaignId: "campaign-1",
        actorId: "user-1",
      }),
    ).rejects.toBeInstanceOf(AgentGameplayError);
  });
});
