import { CommandBus } from "../commands/CommandBus";
import { CHANGE_MAP, SET_CURRENT_MAP } from "../maps/MapLifecycleCommands";
import {
  ADD_WALL_SEGMENT,
  SET_SCENE_LIGHTING_ENABLED,
} from "../scene/SceneMutations";
import { SET_ATMOSPHERE_EFFECT } from "../campaigns/RealtimeCampaignCommands";
import { START_CAMPAIGN_SESSION } from "../campaigns/SessionLifecycleCommands";
import type {
  AgentGameplayEventPublisher,
  AgentGameplayMembership,
  AgentGameplayRole,
} from "../../ports/AgentGameplay";
import {
  AGENT_ACTIVATE_MAP,
  AGENT_ADD_WALL,
  AGENT_SET_ATMOSPHERE_EFFECT,
  AGENT_SET_LIGHTING,
  AGENT_START_SESSION,
  ActivateAgentMap,
  AddAgentWall,
  SetAgentAtmosphereEffect,
  SetAgentLighting,
  StartAgentSession,
} from "./AgentGmCommands";
import { AgentGameplayError } from "./AgentGameplayCommands";

function fixture(role: AgentGameplayRole = "DM") {
  const bus = new CommandBus();
  const dispatched: unknown[] = [];
  const register = (type: string, output: unknown) =>
    bus.register(type, {
      execute: async (command: unknown) => {
        dispatched.push(command);
        return output;
      },
    });
  const map = { id: "map-1", campaignId: "campaign-1", tokens: [] };
  register(SET_CURRENT_MAP, { currentMapId: "map-1" });
  register(CHANGE_MAP, map);
  register(ADD_WALL_SEGMENT, [
    { id: "wall-1", x1: 0, y1: 0, x2: 1, y2: 1, type: "wall" },
  ]);
  register(SET_SCENE_LIGHTING_ENABLED, true);
  register(SET_ATMOSPHERE_EFFECT, "mist");
  register(START_CAMPAIGN_SESSION, { id: "session-1" });
  const memberships: AgentGameplayMembership = { role: async () => role };
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
  return { bus, dispatched, events, memberships, map };
}

const context = { campaignId: "campaign-1", actorId: "user-1" };

describe("agent GM and system commands", () => {
  it("activates a map through core commands and synchronizes connected clients", async () => {
    const value = fixture();
    const result = await new ActivateAgentMap(
      value.bus,
      value.memberships,
      value.events,
    ).execute({ type: AGENT_ACTIVATE_MAP, ...context, mapId: "map-1" });
    expect(result).toBe(value.map);
    expect(value.dispatched).toEqual([
      expect.objectContaining({ type: SET_CURRENT_MAP, mapId: "map-1" }),
      expect.objectContaining({ type: CHANGE_MAP, mapId: "map-1" }),
    ]);
    expect(value.events.syncMap).toHaveBeenCalledWith("campaign-1", value.map);
  });

  it("routes scene and atmosphere control through the existing core handlers", async () => {
    const value = fixture();
    const wall = {
      id: "wall-1",
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      type: "wall" as const,
    };
    await new AddAgentWall(value.bus, value.memberships, value.events).execute({
      type: AGENT_ADD_WALL,
      ...context,
      mapId: "map-1",
      segment: wall,
    });
    await new SetAgentLighting(
      value.bus,
      value.memberships,
      value.events,
    ).execute({
      type: AGENT_SET_LIGHTING,
      ...context,
      mapId: "map-1",
      enabled: true,
    });
    await new SetAgentAtmosphereEffect(
      value.bus,
      value.memberships,
      value.events,
    ).execute({
      type: AGENT_SET_ATMOSPHERE_EFFECT,
      ...context,
      effect: "mist",
    });
    expect(value.dispatched).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: ADD_WALL_SEGMENT, segment: wall }),
        expect.objectContaining({
          type: SET_SCENE_LIGHTING_ENABLED,
          enabled: true,
        }),
        expect.objectContaining({
          type: SET_ATMOSPHERE_EFFECT,
          actorId: "user-1",
        }),
      ]),
    );
  });

  it("lets a DM manage sessions but rejects a player at the agent boundary", async () => {
    const dm = fixture();
    await expect(
      new StartAgentSession(dm.bus, dm.memberships, dm.events).execute({
        type: AGENT_START_SESSION,
        ...context,
      }),
    ).resolves.toEqual({ id: "session-1" });

    const player = fixture("PLAYER");
    await expect(
      new StartAgentSession(
        player.bus,
        player.memberships,
        player.events,
      ).execute({
        type: AGENT_START_SESSION,
        ...context,
      }),
    ).rejects.toThrow(AgentGameplayError);
    expect(player.dispatched).toHaveLength(0);
  });
});
