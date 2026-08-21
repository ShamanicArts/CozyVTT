// ============================================
// Initiative tracker Socket.IO adapter
// ============================================

import { Server } from "socket.io";
import { AuthenticatedSocket } from "../auth";
import logger from "../../utils/logger";
import {
  productionCommandBus,
  productionInitiativeStateStore,
} from "../../composition/productionApplicationHost";
import {
  ADD_INITIATIVE_COMBATANT,
  AddInitiativeCombatantCommand,
  ADVANCE_INITIATIVE_TURN,
  AdvanceInitiativeTurnCommand,
  END_INITIATIVE_COMBAT,
  EndInitiativeCombatCommand,
  InitiativeRollBroadcast,
  REMOVE_INITIATIVE_COMBATANT,
  RemoveInitiativeCombatantCommand,
  REORDER_INITIATIVE,
  ReorderInitiativeCommand,
  ROLL_INITIATIVE,
  RollInitiativeCommand,
  SET_INITIATIVE_VALUE,
  SetInitiativeValueCommand,
  START_INITIATIVE_COMBAT,
  StartInitiativeCombatCommand,
} from "../../application/initiative/InitiativeCommands";
import {
  InitiativeError,
  InitiativeState,
} from "../../domain/initiative/Initiative";
import { MapRevisionConflictError } from "../../domain/maps/MapRevision";

// Commands own initiative transitions, validation and persistence. Socket.IO
// authenticates the actor and fans the resulting state out to campaign peers.
const initiativeCommands = productionCommandBus;

function commandContext(socket: AuthenticatedSocket, campaignId: string) {
  return { campaignId, userId: socket.userId!, role: socket.role };
}

function isInitiativeError(
  error: unknown,
): error is InitiativeError | MapRevisionConflictError {
  return (
    error instanceof InitiativeError ||
    error instanceof MapRevisionConflictError
  );
}

export function registerInitiativeHandlers(
  io: Server,
  socket: AuthenticatedSocket,
): void {
  async function broadcastInitiativeState(
    campaignId: string,
    state: InitiativeState,
  ): Promise<void> {
    io.to(campaignId).emit("initiative.state", state);
  }

  socket.on(
    "initiative.add",
    async (data: { tokenId: string; mapId: string }) => {
      try {
        if (!socket.campaignId) {
          socket.emit("error", { message: "Not authenticated to a campaign" });
          return;
        }
        const { tokenId, mapId } = data;
        const state = await initiativeCommands.dispatch<
          AddInitiativeCombatantCommand,
          InitiativeState
        >({
          type: ADD_INITIATIVE_COMBATANT,
          context: commandContext(socket, socket.campaignId),
          tokenId,
          mapId,
        });
        await broadcastInitiativeState(socket.campaignId, state);
        logger.debug("initiative.add", {
          tokenId,
          campaignId: socket.campaignId,
        });
      } catch (error) {
        if (isInitiativeError(error)) {
          socket.emit("error", { message: error.message });
          return;
        }
        logger.error("initiative.add failed", { err: error });
        socket.emit("error", { message: "Failed to add to initiative" });
      }
    },
  );

  socket.on("initiative.remove", async (data: { tokenId: string }) => {
    try {
      if (!socket.campaignId) {
        socket.emit("error", { message: "Not authenticated to a campaign" });
        return;
      }
      const { tokenId } = data;
      const state = await initiativeCommands.dispatch<
        RemoveInitiativeCombatantCommand,
        InitiativeState
      >({
        type: REMOVE_INITIATIVE_COMBATANT,
        context: commandContext(socket, socket.campaignId),
        tokenId,
      });
      await broadcastInitiativeState(socket.campaignId, state);
    } catch (error) {
      if (isInitiativeError(error)) {
        socket.emit("error", { message: error.message });
        return;
      }
      logger.error("initiative.remove failed", { err: error });
      socket.emit("error", { message: "Failed to remove from initiative" });
    }
  });

  socket.on(
    "initiative.set",
    async (data: { tokenId: string; mapId: string; value: number | null }) => {
      try {
        if (!socket.campaignId) {
          socket.emit("error", { message: "Not authenticated to a campaign" });
          return;
        }
        const { tokenId, mapId, value } = data;
        const state = await initiativeCommands.dispatch<
          SetInitiativeValueCommand,
          InitiativeState
        >({
          type: SET_INITIATIVE_VALUE,
          context: commandContext(socket, socket.campaignId),
          tokenId,
          mapId,
          value,
        });
        await broadcastInitiativeState(socket.campaignId, state);
        logger.debug("initiative.set", {
          tokenId,
          value,
          campaignId: socket.campaignId,
        });
      } catch (error) {
        if (isInitiativeError(error)) {
          socket.emit("error", { message: error.message });
          return;
        }
        logger.error("initiative.set failed", { err: error });
        socket.emit("error", { message: "Failed to set initiative value" });
      }
    },
  );

  socket.on(
    "initiative.roll",
    async (data: {
      tokenId: string;
      mapId: string;
      expression: string;
      characterName?: string;
    }) => {
      try {
        if (!socket.campaignId) {
          socket.emit("error", { message: "Not authenticated to a campaign" });
          return;
        }
        const { tokenId, mapId, expression, characterName } = data;
        const result = await initiativeCommands.dispatch<
          RollInitiativeCommand,
          {
            state: InitiativeState;
            roll: InitiativeRollBroadcast;
            tokenName: string;
          }
        >({
          type: ROLL_INITIATIVE,
          context: commandContext(socket, socket.campaignId),
          tokenId,
          mapId,
          expression,
          characterName,
        });
        // Retain the legacy ordering: dice log first, updated initiative state second.
        io.to(socket.campaignId).emit("dice.rolled", result.roll);
        await broadcastInitiativeState(socket.campaignId, result.state);
        logger.debug("initiative.roll", {
          expression,
          result: result.roll.result,
          name: result.tokenName,
          campaignId: socket.campaignId,
        });
      } catch (error) {
        if (isInitiativeError(error)) {
          socket.emit("error", { message: error.message });
          return;
        }
        logger.error("initiative.roll failed", { err: error });
        socket.emit("error", { message: "Failed to roll initiative" });
      }
    },
  );

  socket.on(
    "initiative.reorder",
    async (data: { orderedTokenIds: string[] }) => {
      try {
        if (!socket.campaignId) {
          socket.emit("error", { message: "Not authenticated to a campaign" });
          return;
        }
        const { orderedTokenIds } = data;
        const state = await initiativeCommands.dispatch<
          ReorderInitiativeCommand,
          InitiativeState
        >({
          type: REORDER_INITIATIVE,
          context: commandContext(socket, socket.campaignId),
          orderedTokenIds,
        });
        await broadcastInitiativeState(socket.campaignId, state);
      } catch (error) {
        if (isInitiativeError(error)) {
          socket.emit("error", { message: error.message });
          return;
        }
        logger.error("initiative.reorder failed", { err: error });
        socket.emit("error", { message: "Failed to reorder initiative" });
      }
    },
  );

  socket.on("initiative.start", async () => {
    try {
      if (!socket.campaignId) {
        socket.emit("error", { message: "Not authenticated to a campaign" });
        return;
      }
      const state = await initiativeCommands.dispatch<
        StartInitiativeCombatCommand,
        InitiativeState
      >({
        type: START_INITIATIVE_COMBAT,
        context: commandContext(socket, socket.campaignId),
      });
      await broadcastInitiativeState(socket.campaignId, state);
      logger.info("initiative.start", {
        campaignId: socket.campaignId,
        first: state.combatants[0].name,
      });
    } catch (error) {
      if (isInitiativeError(error)) {
        socket.emit("error", { message: error.message });
        return;
      }
      logger.error("initiative.start failed", { err: error });
      socket.emit("error", { message: "Failed to start combat" });
    }
  });

  socket.on("initiative.next", async () => {
    try {
      if (!socket.campaignId) {
        socket.emit("error", { message: "Not authenticated to a campaign" });
        return;
      }
      const state = await initiativeCommands.dispatch<
        AdvanceInitiativeTurnCommand,
        InitiativeState
      >({
        type: ADVANCE_INITIATIVE_TURN,
        context: commandContext(socket, socket.campaignId),
      });
      await broadcastInitiativeState(socket.campaignId, state);
      logger.debug("initiative.next", {
        round: state.round,
        current: state.currentTokenId,
        campaignId: socket.campaignId,
      });
    } catch (error) {
      if (isInitiativeError(error)) {
        socket.emit("error", { message: error.message });
        return;
      }
      logger.error("initiative.next failed", { err: error });
      socket.emit("error", { message: "Failed to advance initiative" });
    }
  });

  socket.on("initiative.end", async () => {
    try {
      if (!socket.campaignId) {
        socket.emit("error", { message: "Not authenticated to a campaign" });
        return;
      }
      const state = await initiativeCommands.dispatch<
        EndInitiativeCombatCommand,
        InitiativeState
      >({
        type: END_INITIATIVE_COMBAT,
        context: commandContext(socket, socket.campaignId),
      });
      await broadcastInitiativeState(socket.campaignId, state);
      logger.info("initiative.end", { campaignId: socket.campaignId });
    } catch (error) {
      if (isInitiativeError(error)) {
        socket.emit("error", { message: error.message });
        return;
      }
      logger.error("initiative.end failed", { err: error });
      socket.emit("error", { message: "Failed to end combat" });
    }
  });

  // Read-only reconnect query remains outside the mutation command spine.
  socket.on("initiative.request_state", async () => {
    if (!socket.campaignId) return;
    try {
      const snapshot = await productionInitiativeStateStore.get(
        socket.campaignId,
      );
      socket.emit("initiative.state", snapshot.state);
    } catch (error) {
      logger.error("initiative.request_state failed", { err: error });
      socket.emit("error", { message: "Failed to load initiative state" });
    }
  });
}
