import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignSceneAccess } from "@/presentations/scene";
import type socketClient from "@/services/socket";
import { useGameStore } from "@/stores/gameStore";
import type { LightSource } from "@/types/walls";
import {
  CampaignRole,
  CampaignStatus,
  type Campaign,
  type Map,
  type Token,
} from "@/types";

const campaign = {
  id: "campaign-1",
  status: CampaignStatus.ACTIVE,
  characters: [{ id: "character-1", userId: "player-1" }],
} as Campaign;

const map = {
  id: "map-1",
  revision: 4,
  name: "Old Keep",
  imageUrl: "/maps/keep.webp",
  width: 20,
  height: 12,
  gridSize: 50,
  lightingEnabled: true,
  wallSegments: [
    { id: "wall-1", x1: 0, y1: 0, x2: 100, y2: 0, type: "wall" },
  ],
  lights: [
    {
      id: "light-1",
      x: 50,
      y: 50,
      brightRadius: 2,
      dimRadius: 4,
      color: "#ffcc66",
      enabled: true,
    },
  ],
} as Map;

const token = {
  id: "token-1",
  characterId: "character-1",
  name: "Mira",
  imageUrl: "/tokens/mira.webp",
  position: { x: 2, y: 3 },
  size: { width: 1, height: 1 },
  rotation: 0,
  disposition: "friendly",
  controlledBy: null,
} as Token;

afterEach(() => useGameStore.getState().clearGameState());

describe("CampaignSceneAccess", () => {
  it("projects only host-authorized scene data and movement permission", () => {
    useGameStore.getState().setTokens([token]);
    const access = new CampaignSceneAccess(
      {
        campaign,
        map,
        role: CampaignRole.PLAYER,
        userId: "player-1",
      },
      vi.fn(),
    );

    expect(access.getSnapshot()).toMatchObject({
      version: "1",
      campaignId: "campaign-1",
      role: CampaignRole.PLAYER,
      map: {
        id: "map-1",
        revision: 4,
        tokens: [{ id: "token-1", canMove: true }],
        walls: [{ id: "wall-1" }],
        lights: [{ id: "light-1" }],
        fog: { kind: "none" },
      },
    });
    access.dispose();
  });

  it("subscribes to live token state only while a presentation is mounted", () => {
    useGameStore.getState().setTokens([token]);
    const listener = vi.fn();
    const access = new CampaignSceneAccess(
      {
        campaign,
        map,
        role: CampaignRole.DM,
        userId: "dm-1",
      },
      vi.fn(),
    );
    const unsubscribe = access.subscribe(listener);

    useGameStore.getState().applyTokenMove("token-1", { x: 4, y: 5 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(access.getSnapshot().map?.tokens[0]?.position).toEqual({ x: 4, y: 5 });

    unsubscribe();
    useGameStore.getState().applyTokenMove("token-1", { x: 6, y: 7 });
    expect(listener).toHaveBeenCalledTimes(1);
    access.dispose();
  });

  it("shares bounded token selection across presentation subscribers", () => {
    useGameStore.getState().setTokens([token]);
    const listener = vi.fn();
    const access = new CampaignSceneAccess(
      {
        campaign,
        map,
        role: CampaignRole.DM,
        userId: "dm-1",
      },
      vi.fn(),
    );
    const unsubscribe = access.subscribe(listener);

    access.selectToken("token-1");
    expect(access.getSnapshot().selectedTokenId).toBe("token-1");
    expect(listener).toHaveBeenCalledOnce();
    expect(() => access.selectToken("missing-token")).toThrow(
      "Token selection is not permitted.",
    );

    access.selectToken(null);
    expect(access.getSnapshot().selectedTokenId).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    access.dispose();
  });

  it("keeps transient interaction semantics in the host", () => {
    useGameStore.getState().setTokens([token]);
    const listener = vi.fn();
    const access = new CampaignSceneAccess(
      {
        campaign,
        map,
        role: CampaignRole.PLAYER,
        userId: "player-1",
      },
      vi.fn(),
    );
    const unsubscribe = access.subscribe(listener);

    access.setInteractionMode("ruler");
    access.setRulerOrigin({ x: 18, y: 9 });
    access.setRulerColor("purple");
    access.setAoE({ shape: "cone", sizeFt: 30, origin: { x: 5, y: 6 } });

    expect(access.getSnapshot().interaction).toMatchObject({
      mode: "ruler",
      ruler: { origin: token.position, color: "purple" },
      aoe: { origin: { x: 5, y: 6 }, shape: "cone", sizeFt: 30 },
    });
    expect(listener).toHaveBeenCalledTimes(4);
    unsubscribe();
    access.dispose();
  });

  it("requests bounded scene state again when the current map changes", () => {
    const raw = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
    const socket = {
      getSocket: () => raw,
    } as unknown as typeof socketClient;
    const access = new CampaignSceneAccess(
      {
        campaign,
        map,
        role: CampaignRole.DM,
        userId: "dm-1",
      },
      vi.fn(),
    );
    const unsubscribe = access.subscribe(vi.fn());
    access.setSocket(socket);
    raw.emit.mockClear();

    access.update(
      {
        campaign,
        map: { ...map, id: "map-2" },
        role: CampaignRole.DM,
        userId: "dm-1",
      },
      vi.fn(),
    );

    expect(raw.emit.mock.calls).toEqual([
      ["walls:request", { mapId: "map-2" }],
      ["lights:request", { mapId: "map-2" }],
      ["fog:request_state", { mapId: "map-2" }],
    ]);
    unsubscribe();
    access.dispose();
  });

  it("publishes authoritative light updates back to shared map state", () => {
    const raw = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
    const socket = {
      getSocket: () => raw,
    } as unknown as typeof socketClient;
    const onMapChanged = vi.fn();
    const access = new CampaignSceneAccess(
      {
        campaign,
        map,
        role: CampaignRole.DM,
        userId: "dm-1",
      },
      onMapChanged,
    );
    const unsubscribe = access.subscribe(vi.fn());
    access.setSocket(socket);
    const registered = raw.on.mock.calls.find(
      ([event]) => event === "light:updated",
    );
    const updateLight = registered?.[1] as
      | ((event: { mapId: string; light: LightSource }) => void)
      | undefined;
    const movedLight = { ...map.lights![0]!, x: 275, y: 325 };

    updateLight?.({ mapId: map.id, light: movedLight });

    expect(onMapChanged).toHaveBeenCalledWith(
      expect.objectContaining({ lights: [movedLight] }),
    );
    expect(access.getSnapshot().map?.lights).toEqual([movedLight]);
    unsubscribe();
    access.dispose();
  });
});
