import type { Server } from "socket.io";
import { WebsocketCapabilityGameplayEventPublisher } from "./WebsocketCapabilityGameplayEventPublisher";

function socket(id: string, userId: string, role: string) {
  return { id, userId, role, emit: jest.fn() };
}

describe("WebsocketCapabilityGameplayEventPublisher", () => {
  it("sends a role-filtered authoritative map after an capability creates an actor", async () => {
    const dm = socket("socket-dm", "dm-1", "DM");
    const player = socket("socket-player", "player-1", "PLAYER");
    const io = {
      in: () => ({ fetchSockets: async () => [dm, player] }),
    } as unknown as Server;
    const publisher = new WebsocketCapabilityGameplayEventPublisher(
      () => io,
      async () =>
        new Map([
          ["dm-1", true],
          ["player-1", false],
        ]),
    );
    const visible = {
      id: "visible",
      name: "Mira",
      visible: true,
      layer: "token",
      position: { x: 1, y: 1 },
      size: { width: 1, height: 1 },
      controlledBy: "player-1",
    };
    const hidden = {
      ...visible,
      id: "hidden",
      name: "Hidden foe",
      visible: false,
      controlledBy: null,
    };
    const map = {
      id: "map-1",
      campaignId: "campaign-1",
      name: "Vault",
      imageUrl: "/vault.jpg",
      width: 20,
      height: 20,
      gridSize: 50,
      feetPerSquare: 5,
      diagonalRule: "flat",
      baseLayerUrl: "/vault.jpg",
      spiritLayerUrl: "/spirit.jpg",
      tokens: [visible, hidden],
      annotations: [],
      wallSegments: [],
      fogData: null,
      lightingEnabled: false,
      lights: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await publisher.syncMap("campaign-1", map);

    expect(dm.emit).toHaveBeenCalledWith(
      "map.changed",
      expect.objectContaining({
        mapData: expect.objectContaining({ tokens: [visible, hidden] }),
      }),
    );
    expect(player.emit).toHaveBeenCalledWith(
      "map.changed",
      expect.objectContaining({
        mapData: expect.objectContaining({ tokens: [visible] }),
        spiritVisible: false,
      }),
    );
  });

  it("broadcasts ordinary capability movement using the established token event", async () => {
    const emit = jest.fn();
    const io = { to: () => ({ emit }) } as unknown as Server;
    const publisher = new WebsocketCapabilityGameplayEventPublisher(() => io);
    await publisher.actorMoved("campaign-1", "dm-1", {
      map: {
        id: "map-1",
        campaignId: "campaign-1",
        revision: 1,
        width: 20,
        height: 20,
        gridSize: 50,
        lightingEnabled: false,
        wallSegments: [],
        lights: [],
        tokens: [],
      },
      token: {
        id: "npc-1",
        name: "Ashfang",
        imageUrl: "",
        position: { x: 8, y: 9 },
        size: { width: 1, height: 1 },
        layer: "token",
        visible: true,
        rotation: 0,
        conditions: [],
        metadata: {},
      },
      tokens: [],
    });
    expect(emit).toHaveBeenCalledWith("token.moved", {
      tokenId: "npc-1",
      mapId: "map-1",
      x: 8,
      y: 9,
      movedBy: "dm-1",
    });
  });
});
