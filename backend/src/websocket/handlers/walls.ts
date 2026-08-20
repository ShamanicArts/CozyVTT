// ============================================
// Wall handlers: wall:add / wall:remove / wall:update / walls:replace /
// walls:request / dm:editing
// ============================================

import { Server } from 'socket.io';
import { throttle } from 'lodash';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { WallSegmentSchema, WallSegmentsArraySchema } from '../../validators/walls';
import type { WallSegment } from '../../types/walls';
import logger from '../../utils/logger';
import { mapEditLimiter } from '../shared';
import { CommandBus } from '../../application/commands/CommandBus';
import {
  ADD_WALL_SEGMENT, AddWallSegment, AddWallSegmentCommand,
  REMOVE_WALL_SEGMENT, RemoveWallSegment, RemoveWallSegmentCommand,
  REPLACE_WALL_SEGMENTS, ReplaceWallSegments, ReplaceWallSegmentsCommand,
  UPDATE_WALL_SEGMENT, UpdateWallSegment, UpdateWallSegmentCommand,
} from '../../application/scene/SceneMutations';
import { PrismaSceneMutationRepository } from '../../adapters/persistence/PrismaSceneMutationRepository';
import { SceneMutationError, SceneRole } from '../../domain/scene/Scene';

const wallCommands = new CommandBus();
const sceneRepository = new PrismaSceneMutationRepository(prisma);
wallCommands.register(ADD_WALL_SEGMENT, new AddWallSegment(sceneRepository));
wallCommands.register(REMOVE_WALL_SEGMENT, new RemoveWallSegment(sceneRepository));
wallCommands.register(UPDATE_WALL_SEGMENT, new UpdateWallSegment(sceneRepository));
wallCommands.register(REPLACE_WALL_SEGMENTS, new ReplaceWallSegments(sceneRepository));

function actorFor(socket: AuthenticatedSocket, campaignId: string) {
  return { campaignId, role: socket.role as SceneRole };
}

function sendMutationError(socket: AuthenticatedSocket, error: unknown, operation: string, fallback: string): void {
  if (error instanceof SceneMutationError) {
    socket.emit('error', { message: error.message });
    return;
  }
  logger.error(`${operation} failed`, { err: error });
  socket.emit('error', { message: fallback });
}

export function registerWallHandlers(io: Server, socket: AuthenticatedSocket): void {
  socket.on('wall:add', async (data: { mapId: string; segment: unknown }) => {
    try {
      if (!socket.campaignId) return;
      // This must precede Zod validation: unauthorized malformed requests have
      // historically received the role error rather than a schema error.
      if (socket.role !== 'DM') { socket.emit('error', { message: 'Only DMs can add wall segments' }); return; }
      if (!mapEditLimiter.check(socket.id, 40, 1000)) return;
      const { mapId, segment } = data;
      if (!mapId) { socket.emit('error', { message: 'mapId required' }); return; }
      const parsed = WallSegmentSchema.safeParse(segment);
      if (!parsed.success) { socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid wall segment' }); return; }

      await wallCommands.dispatch<AddWallSegmentCommand, WallSegment[]>({
        type: ADD_WALL_SEGMENT, actor: actorFor(socket, socket.campaignId), mapId, segment: parsed.data,
      });
      io.to(socket.campaignId).emit('wall:added', { mapId, segment: parsed.data });
    } catch (error) { sendMutationError(socket, error, 'wall:add', 'Failed to add wall segment'); }
  });

  socket.on('wall:remove', async (data: { mapId: string; segmentId: string }) => {
    try {
      if (!socket.campaignId) return;
      if (socket.role !== 'DM') { socket.emit('error', { message: 'Only DMs can remove wall segments' }); return; }
      if (!mapEditLimiter.check(socket.id, 40, 1000)) return;
      const { mapId, segmentId } = data;
      if (!mapId || !segmentId) { socket.emit('error', { message: 'mapId and segmentId required' }); return; }

      await wallCommands.dispatch<RemoveWallSegmentCommand, WallSegment[]>({
        type: REMOVE_WALL_SEGMENT, actor: actorFor(socket, socket.campaignId), mapId, segmentId,
      });
      io.to(socket.campaignId).emit('wall:removed', { mapId, segmentId });
    } catch (error) { sendMutationError(socket, error, 'wall:remove', 'Failed to remove wall segment'); }
  });

  socket.on('wall:update', async (data: { mapId: string; segment: unknown }) => {
    try {
      if (!socket.campaignId) return;
      if (socket.role !== 'DM' && socket.role !== 'PLAYER') { socket.emit('error', { message: 'Permission denied' }); return; }
      if (!mapEditLimiter.check(socket.id, 40, 1000)) return;
      const { mapId, segment } = data;
      if (!mapId) { socket.emit('error', { message: 'mapId required' }); return; }
      const parsed = WallSegmentSchema.safeParse(segment);
      if (!parsed.success) { socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid wall segment' }); return; }

      await wallCommands.dispatch<UpdateWallSegmentCommand, WallSegment[]>({
        type: UPDATE_WALL_SEGMENT, actor: actorFor(socket, socket.campaignId), mapId, segment: parsed.data,
      });
      io.to(socket.campaignId).emit('wall:updated', { mapId, segment: parsed.data });
    } catch (error) { sendMutationError(socket, error, 'wall:update', 'Failed to update wall segment'); }
  });

  socket.on('walls:replace', async (data: { mapId: string; segments: unknown }) => {
    try {
      if (!socket.campaignId) return;
      if (socket.role !== 'DM') { socket.emit('error', { message: 'Only DMs can replace wall segments' }); return; }
      if (!mapEditLimiter.check(socket.id, 40, 1000)) return;
      const { mapId, segments } = data;
      if (!mapId) { socket.emit('error', { message: 'mapId required' }); return; }
      const parsed = WallSegmentsArraySchema.safeParse(segments);
      if (!parsed.success) { socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid segments array' }); return; }

      await wallCommands.dispatch<ReplaceWallSegmentsCommand, WallSegment[]>({
        type: REPLACE_WALL_SEGMENTS, actor: actorFor(socket, socket.campaignId), mapId, segments: parsed.data,
      });
      io.to(socket.campaignId).emit('walls:replaced', { mapId, segments: parsed.data });
    } catch (error) { sendMutationError(socket, error, 'walls:replace', 'Failed to replace wall segments'); }
  });

  socket.on('walls:request', async (data: { mapId: string }) => {
    try {
      if (!socket.campaignId) return;
      const { mapId } = data;
      if (!mapId) return;
      const map = await prisma.map.findUnique({ where: { id: mapId }, select: { campaignId: true, wallSegments: true } });
      if (!map || map.campaignId !== socket.campaignId) return;
      const segments = (Array.isArray(map.wallSegments) ? map.wallSegments : []) as unknown as WallSegment[];
      socket.emit('walls:replaced', { mapId, segments });
    } catch (error) { logger.error('walls:request failed', { err: error }); }
  });

  const emitDmEditing = throttle((mapId: string) => {
    if (socket.campaignId) socket.to(socket.campaignId).emit('dm:editing', { mapId, timestamp: new Date().toISOString() });
  }, 500);

  socket.on('dm:editing', (data: { mapId: string }) => {
    if (!socket.campaignId || socket.role !== 'DM') return;
    if (data?.mapId) emitDmEditing(data.mapId);
  });
}
