import type { Server } from "socket.io";
import type { RollDiceResult } from "../../application/dice/RollDice";
import type { InitiativeRollBroadcast } from "../../application/initiative/InitiativeCommands";
import type { InitiativeState } from "../../domain/initiative/Initiative";
import type { SendChatMessageResult } from "../../application/chat/SendChatMessage";
import type { AgentGameplayEventPublisher } from "../../ports/AgentGameplay";
import type { FinalizeTokenMoveResult } from "../../application/tokens/TokenMovement";
import {
  filterMapData,
  filterTokensByLighting,
  getSpiritVisibilityBatch,
} from "../../utils/spirit-layer";
import type { AuthenticatedSocket } from "../../websocket/auth";
import { getSocketInstance } from "../../websocket/socketInstance";
import type { WallSegment } from "../../types/walls";

/** Socket.IO fan-out for MCP/extension-originated gameplay commands. */
export class WebsocketAgentGameplayEventPublisher implements AgentGameplayEventPublisher {
  constructor(
    private readonly socketServer: () => Server = getSocketInstance,
    private readonly spiritVisibility: typeof getSpiritVisibilityBatch = getSpiritVisibilityBatch,
  ) {}

  async syncMap(campaignId: string, map: unknown): Promise<void> {
    const io = this.socketServer();
    const sockets = await io.in(campaignId).fetchSockets();
    const visibility = await this.spiritVisibility(
      campaignId,
      sockets
        .map((socket) => (socket as unknown as AuthenticatedSocket).userId)
        .filter((id): id is string => Boolean(id)),
    );
    for (const socket of sockets) {
      const authenticated = socket as unknown as AuthenticatedSocket;
      const spiritVisible =
        authenticated.role === "DM" ||
        (authenticated.userId
          ? (visibility.get(authenticated.userId) ?? false)
          : false);
      const mapRecord = map as Parameters<typeof filterMapData>[0];
      socket.emit("map.changed", {
        mapId: mapRecord.id,
        mapData: filterMapData(
          mapRecord,
          authenticated.role ?? "PLAYER",
          spiritVisible,
          authenticated.userId,
        ),
        spiritVisible,
      });
    }
  }

  async characterHpUpdated(
    campaignId: string,
    characterId: string,
    hp: { current: number; max: number; temp: number },
  ): Promise<void> {
    this.socketServer()
      .to(campaignId)
      .emit("character.hp.updated", { characterId, hp });
  }

  async rosterUpdated(campaignId: string, payload: unknown): Promise<void> {
    this.socketServer().to(campaignId).emit("roster.updated", payload);
  }

  async actorMoved(
    campaignId: string,
    movedBy: string,
    result: FinalizeTokenMoveResult,
  ): Promise<void> {
    const io = this.socketServer();
    const { map, token, tokens } = result;
    const payload = {
      tokenId: token.id,
      mapId: map.id,
      x: token.position.x,
      y: token.position.y,
      movedBy,
    };
    if (token.layer === "spirit") {
      const sockets = await io.in(campaignId).fetchSockets();
      const visibility = await this.spiritVisibility(
        campaignId,
        sockets
          .map((socket) => (socket as unknown as AuthenticatedSocket).userId)
          .filter((id): id is string => Boolean(id)),
      );
      for (const socket of sockets) {
        const authenticated = socket as unknown as AuthenticatedSocket;
        if (
          authenticated.role === "DM" ||
          (authenticated.userId && visibility.get(authenticated.userId))
        ) {
          socket.emit("token.moved", payload);
        }
      }
      return;
    }
    if (!map.lightingEnabled) {
      io.to(campaignId).emit("token.moved", payload);
      return;
    }
    const sockets = await io.in(campaignId).fetchSockets();
    for (const socket of sockets) {
      const authenticated = socket as unknown as AuthenticatedSocket;
      if (authenticated.role === "DM") {
        socket.emit("token.moved", payload);
        continue;
      }
      if (!authenticated.userId) continue;
      const visibleTokens = filterTokensByLighting(
        tokens,
        authenticated.userId,
        map.wallSegments as unknown as WallSegment[],
        map.width,
        map.height,
        map.gridSize,
        true,
        map.lights,
      );
      const visibleIds = new Set(visibleTokens.map(({ id }) => id));
      if (visibleIds.has(token.id)) {
        socket.emit("token.moved", payload);
        socket.emit("token:appeared", { token, mapId: map.id });
      } else {
        socket.emit("token:disappeared", {
          tokenId: token.id,
          mapId: map.id,
        });
      }
      if (token.controlledBy === authenticated.userId) {
        for (const otherToken of tokens) {
          if (
            otherToken.id === token.id ||
            otherToken.controlledBy === authenticated.userId
          ) {
            continue;
          }
          if (visibleIds.has(otherToken.id)) {
            socket.emit("token:appeared", {
              token: otherToken,
              mapId: map.id,
            });
          } else {
            socket.emit("token:disappeared", {
              tokenId: otherToken.id,
              mapId: map.id,
            });
          }
        }
      }
    }
  }

  async chatMessage(
    campaignId: string,
    message: SendChatMessageResult,
  ): Promise<void> {
    this.socketServer().to(campaignId).emit("chat.message", message);
  }

  async diceRolled(campaignId: string, roll: RollDiceResult): Promise<void> {
    const io = this.socketServer();
    if (!roll.secret) {
      io.to(campaignId).emit("dice.rolled", roll);
      return;
    }
    const sockets = await io.in(campaignId).fetchSockets();
    for (const socket of sockets) {
      const authenticated = socket as unknown as AuthenticatedSocket;
      if (authenticated.role === "DM") {
        socket.emit("dice.rolled.secret", {
          ...roll,
          originalRoller: roll.userId,
          isAuditView: true,
        });
      }
    }
  }

  async initiativeChanged(
    campaignId: string,
    state: InitiativeState,
    roll?: InitiativeRollBroadcast,
  ): Promise<void> {
    const room = this.socketServer().to(campaignId);
    if (roll) room.emit("dice.rolled", roll);
    room.emit("initiative.state", state);
  }
}
