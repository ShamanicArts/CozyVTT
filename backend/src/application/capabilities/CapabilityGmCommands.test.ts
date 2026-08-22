import { CommandBus } from "../commands/CommandBus";
import { CHANGE_MAP, SET_CURRENT_MAP } from "../maps/MapLifecycleCommands";
import {
  ADD_WALL_SEGMENT,
  SET_SCENE_LIGHTING_ENABLED,
} from "../scene/SceneMutations";
import { SET_ATMOSPHERE_EFFECT } from "../campaigns/RealtimeCampaignCommands";
import { START_CAMPAIGN_SESSION } from "../campaigns/SessionLifecycleCommands";
import type {
  CapabilityGameplayEventPublisher,
  CapabilityGameplayMembership,
  CapabilityGameplayRole,
} from "../../ports/CapabilityGameplay";
import {
  PUBLIC_ACTIVATE_MAP,
  PUBLIC_ADD_WALL,
  PUBLIC_SET_ATMOSPHERE_EFFECT,
  PUBLIC_SET_LIGHTING,
  PUBLIC_START_SESSION,
  ActivateCapabilityMap,
  AddCapabilityWall,
  SetCapabilityAtmosphereEffect,
  SetCapabilityLighting,
  StartCapabilitySession,
} from "./CapabilityGmCommands";
import { CapabilityGameplayError } from "./CapabilityGameplayCommands";

function fixture(role: CapabilityGameplayRole = "DM") {
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
  const memberships: CapabilityGameplayMembership = { role: async () => role };
  const events: jest.Mocked<CapabilityGameplayEventPublisher> = {
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

describe("capability GM and system commands", () => {
  it("activates a map through core commands and synchronizes connected clients", async () => {
    const value = fixture();
    const result = await new ActivateCapabilityMap(
      value.bus,
      value.memberships,
      value.events,
    ).execute({ type: PUBLIC_ACTIVATE_MAP, ...context, mapId: "map-1" });
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
    await new AddCapabilityWall(value.bus, value.memberships, value.events).execute({
      type: PUBLIC_ADD_WALL,
      ...context,
      mapId: "map-1",
      segment: wall,
    });
    await new SetCapabilityLighting(
      value.bus,
      value.memberships,
      value.events,
    ).execute({
      type: PUBLIC_SET_LIGHTING,
      ...context,
      mapId: "map-1",
      enabled: true,
    });
    await new SetCapabilityAtmosphereEffect(
      value.bus,
      value.memberships,
      value.events,
    ).execute({
      type: PUBLIC_SET_ATMOSPHERE_EFFECT,
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

  it("lets a DM manage sessions but rejects a player at the capability boundary", async () => {
    const dm = fixture();
    await expect(
      new StartCapabilitySession(dm.bus, dm.memberships, dm.events).execute({
        type: PUBLIC_START_SESSION,
        ...context,
      }),
    ).resolves.toEqual({ id: "session-1" });

    const player = fixture("PLAYER");
    await expect(
      new StartCapabilitySession(
        player.bus,
        player.memberships,
        player.events,
      ).execute({
        type: PUBLIC_START_SESSION,
        ...context,
      }),
    ).rejects.toThrow(CapabilityGameplayError);
    expect(player.dispatched).toHaveLength(0);
  });
});
