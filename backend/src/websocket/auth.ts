import { Socket } from 'socket.io';
import { productionRealtimeQueries } from '../composition/productionRealtimeQueries';
import logger from '../utils/logger';

/**
 * WebSocket Authentication Middleware
 * Connection & Authentication
 *
 * Every WebSocket connection is authenticated against the Express session store
 * before any campaign events are processed.
 */

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  campaignId?: string;
  role?: string;
}

/**
 * Authenticate an incoming WebSocket connection via the shared Express session.
 * Attaches userId to the socket on success.
 */
export async function authenticateSocket(socket: AuthenticatedSocket): Promise<boolean> {
  try {
    const session = (socket.request as any).session;

    if (!session || !session.userId) {
      return false;
    }

    const user = await productionRealtimeQueries.authenticatedUser(session.userId);

    if (!user) {
      return false;
    }

    socket.userId = user.id;
    return true;
  } catch (error) {
    logger.error('WebSocket authentication error', { err: error });
    return false;
  }
}

/**
 * Validate campaign membership and assign role
 * Called when user joins a campaign room
 */
export async function authenticateCampaign(
  socket: AuthenticatedSocket,
  campaignId: string
): Promise<{ success: boolean; role?: string; error?: string }> {
  try {
    if (!socket.userId) {
      return { success: false, error: 'Socket not authenticated' };
    }

    const role = await productionRealtimeQueries.campaignRole(
      socket.userId,
      campaignId,
    );
    if (!role) {
      return { success: false, error: 'You are not a member of this campaign' };
    }

    socket.campaignId = campaignId;
    socket.role = role;

    return {
      success: true,
      role,
    };
  } catch (error) {
    logger.error('WebSocket campaign authentication error', { err: error });
    return { success: false, error: 'Internal server error' };
  }
}
