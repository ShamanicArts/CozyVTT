// ============================================
// Fog of war handlers: fog:operation / fog:request_state
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { FogOperationSchema } from '../../validators/walls';
import type { FogState } from '../../types/walls';
import logger from '../../utils/logger';
import { fogOperationLimiter, loadFogState, revealedCellIndices } from '../shared';
import { CommandBus } from '../../application/commands/CommandBus';
import { APPLY_FOG_OPERATION, ApplyFogOperation, ApplyFogOperationCommand } from '../../application/scene/SceneMutations';
import { PrismaSceneMutationRepository } from '../../adapters/persistence/PrismaSceneMutationRepository';
import { FogState as SceneFogState, SceneMutationError, SceneRole } from '../../domain/scene/Scene';

const fogCommands = new CommandBus();
fogCommands.register(APPLY_FOG_OPERATION, new ApplyFogOperation(new PrismaSceneMutationRepository(prisma)));

function actorFor(socket: AuthenticatedSocket, campaignId: string) {
  return { campaignId, role: socket.role as SceneRole };
}

export function registerFogHandlers(io: Server, socket: AuthenticatedSocket): void {
  socket.on('fog:operation', async (data: { mapId: string; operation: unknown }) => {
    try {
      if (!socket.campaignId) return;
      // Preserve legacy role-first validation precedence at the transport edge.
      if (socket.role !== 'DM') { socket.emit('error', { message: 'Only DMs can modify fog of war' }); return; }
      if (!fogOperationLimiter.check(socket.id, 10, 1000)) return;

      const { mapId, operation } = data;
      if (!mapId) { socket.emit('error', { message: 'mapId required' }); return; }
      const parsed = FogOperationSchema.safeParse(operation);
      if (!parsed.success) { socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid fog operation' }); return; }

      const fog = await fogCommands.dispatch<ApplyFogOperationCommand, SceneFogState>({
        type: APPLY_FOG_OPERATION, actor: actorFor(socket, socket.campaignId), mapId, operation: parsed.data,
      });

      // Recipient filtering is an adapter concern: DM gets full fog state,
      // all other campaign members only receive revealed cell indices.
      const campaignSockets = await io.in(socket.campaignId).fetchSockets();
      for (const recipient of campaignSockets) {
        const authed = recipient as unknown as AuthenticatedSocket;
        if (authed.role === 'DM') {
          recipient.emit('fog:updated', { mapId, fogState: fog });
        } else {
          recipient.emit('fog:cells', {
            mapId,
            revealedCells: revealedCellIndices(fog),
            fogCols: fog.fogCols,
            fogRows: fog.fogRows,
            cellPx: fog.cellPx,
          });
        }
      }
    } catch (error) {
      if (error instanceof SceneMutationError) {
        socket.emit('error', { message: error.message });
        return;
      }
      logger.error('fog:operation failed', { err: error });
      socket.emit('error', { message: 'Failed to apply fog operation' });
    }
  });

  /** Any campaign member requests current fog state on (re)join. */
  socket.on('fog:request_state', async (data: { mapId: string }) => {
    try {
      if (!socket.campaignId) return;
      const { mapId } = data;
      if (!mapId) return;

      const map = await prisma.map.findUnique({
        where: { id: mapId },
        select: { campaignId: true, fogData: true, width: true, height: true, gridSize: true },
      });
      if (!map || map.campaignId !== socket.campaignId) return;

      const fog: FogState = loadFogState(map, map.fogData as FogState | null);
      if (socket.role === 'DM') {
        socket.emit('fog:updated', { mapId, fogState: fog });
      } else {
        socket.emit('fog:cells', {
          mapId, revealedCells: revealedCellIndices(fog), fogCols: fog.fogCols, fogRows: fog.fogRows, cellPx: fog.cellPx,
        });
      }
    } catch (error) {
      logger.error('fog:request_state failed', { err: error });
    }
  });
}
