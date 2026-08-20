// ============================================
// Light source handlers: light:add / light:remove / light:update /
// lights:replace / lights:request
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { LightSourceSchema, LightSourcesArraySchema } from '../../validators/walls';
import type { LightSource } from '../../types/walls';
import logger from '../../utils/logger';
import { mapEditLimiter } from '../shared';
import { CommandBus } from '../../application/commands/CommandBus';
import {
  ADD_LIGHT_SOURCE, AddLightSource, AddLightSourceCommand,
  REMOVE_LIGHT_SOURCE, RemoveLightSource, RemoveLightSourceCommand,
  REPLACE_LIGHT_SOURCES, ReplaceLightSources, ReplaceLightSourcesCommand,
  UPDATE_LIGHT_SOURCE, UpdateLightSource, UpdateLightSourceCommand,
} from '../../application/scene/SceneMutations';
import { PrismaSceneMutationRepository } from '../../adapters/persistence/PrismaSceneMutationRepository';
import { SceneMutationError, SceneRole } from '../../domain/scene/Scene';

const lightCommands = new CommandBus();
const sceneRepository = new PrismaSceneMutationRepository(prisma);
lightCommands.register(ADD_LIGHT_SOURCE, new AddLightSource(sceneRepository));
lightCommands.register(REMOVE_LIGHT_SOURCE, new RemoveLightSource(sceneRepository));
lightCommands.register(UPDATE_LIGHT_SOURCE, new UpdateLightSource(sceneRepository));
lightCommands.register(REPLACE_LIGHT_SOURCES, new ReplaceLightSources(sceneRepository));

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

export function registerLightHandlers(io: Server, socket: AuthenticatedSocket): void {
  socket.on('light:add', async (data: { mapId: string; light: unknown }) => {
    try {
      if (!socket.campaignId) return;
      if (socket.role !== 'DM') { socket.emit('error', { message: 'Only DMs can add light sources' }); return; }
      if (!mapEditLimiter.check(socket.id, 40, 1000)) return;
      const { mapId, light } = data;
      if (!mapId) { socket.emit('error', { message: 'mapId required' }); return; }
      const parsed = LightSourceSchema.safeParse(light);
      if (!parsed.success) { socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid light source' }); return; }

      await lightCommands.dispatch<AddLightSourceCommand, LightSource[]>({
        type: ADD_LIGHT_SOURCE, actor: actorFor(socket, socket.campaignId), mapId, light: parsed.data,
      });
      io.to(socket.campaignId).emit('light:added', { mapId, light: parsed.data });
    } catch (error) { sendMutationError(socket, error, 'light:add', 'Failed to add light source'); }
  });

  socket.on('light:remove', async (data: { mapId: string; lightId: string }) => {
    try {
      if (!socket.campaignId) return;
      if (socket.role !== 'DM') { socket.emit('error', { message: 'Only DMs can remove light sources' }); return; }
      if (!mapEditLimiter.check(socket.id, 40, 1000)) return;
      const { mapId, lightId } = data;
      if (!mapId || !lightId) { socket.emit('error', { message: 'mapId and lightId required' }); return; }

      await lightCommands.dispatch<RemoveLightSourceCommand, LightSource[]>({
        type: REMOVE_LIGHT_SOURCE, actor: actorFor(socket, socket.campaignId), mapId, lightId,
      });
      io.to(socket.campaignId).emit('light:removed', { mapId, lightId });
    } catch (error) { sendMutationError(socket, error, 'light:remove', 'Failed to remove light source'); }
  });

  socket.on('light:update', async (data: { mapId: string; light: unknown }) => {
    try {
      if (!socket.campaignId) return;
      if (socket.role !== 'DM') { socket.emit('error', { message: 'Only DMs can update light sources' }); return; }
      if (!mapEditLimiter.check(socket.id, 40, 1000)) return;
      const { mapId, light } = data;
      if (!mapId) { socket.emit('error', { message: 'mapId required' }); return; }
      const parsed = LightSourceSchema.safeParse(light);
      if (!parsed.success) { socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid light source' }); return; }

      await lightCommands.dispatch<UpdateLightSourceCommand, LightSource[]>({
        type: UPDATE_LIGHT_SOURCE, actor: actorFor(socket, socket.campaignId), mapId, light: parsed.data,
      });
      io.to(socket.campaignId).emit('light:updated', { mapId, light: parsed.data });
    } catch (error) { sendMutationError(socket, error, 'light:update', 'Failed to update light source'); }
  });

  socket.on('lights:replace', async (data: { mapId: string; lights: unknown }) => {
    try {
      if (!socket.campaignId) return;
      if (socket.role !== 'DM') { socket.emit('error', { message: 'Only DMs can replace light sources' }); return; }
      if (!mapEditLimiter.check(socket.id, 40, 1000)) return;
      const { mapId, lights } = data;
      if (!mapId) { socket.emit('error', { message: 'mapId required' }); return; }
      const parsed = LightSourcesArraySchema.safeParse(lights);
      if (!parsed.success) { socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid lights array' }); return; }

      await lightCommands.dispatch<ReplaceLightSourcesCommand, LightSource[]>({
        type: REPLACE_LIGHT_SOURCES, actor: actorFor(socket, socket.campaignId), mapId, lights: parsed.data,
      });
      io.to(socket.campaignId).emit('lights:replaced', { mapId, lights: parsed.data });
    } catch (error) { sendMutationError(socket, error, 'lights:replace', 'Failed to replace light sources'); }
  });

  socket.on('lights:request', async (data: { mapId: string }) => {
    try {
      if (!socket.campaignId) return;
      const { mapId } = data;
      if (!mapId) return;
      const map = await prisma.map.findUnique({ where: { id: mapId }, select: { campaignId: true, lights: true } });
      if (!map || map.campaignId !== socket.campaignId) return;
      const lights = (Array.isArray(map.lights) ? map.lights : []) as unknown as LightSource[];
      socket.emit('lights:replaced', { mapId, lights });
    } catch (error) { logger.error('lights:request failed', { err: error }); }
  });
}
