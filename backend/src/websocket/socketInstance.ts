import type { Server } from "socket.io";

let ioInstance: Server | null = null;

/** Process-local Socket.IO output adapter; it has no application dependencies. */
export function setSocketInstance(io: Server): void {
  ioInstance = io;
}

export function getSocketInstance(): Server {
  if (!ioInstance) throw new Error("Socket.io instance not initialized");
  return ioInstance;
}

export function broadcastToCampaign(
  campaignId: string,
  event: string,
  data: unknown,
): void {
  getSocketInstance().to(campaignId).emit(event, data);
}

export function broadcastToUser(
  userId: string,
  event: string,
  data: unknown,
): void {
  getSocketInstance().to(userId).emit(event, data);
}
