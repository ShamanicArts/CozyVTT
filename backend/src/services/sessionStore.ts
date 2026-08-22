import { prisma } from "../config/database";
import logger from "../utils/logger";

/** End every connect-pg-simple login session belonging to a user. */
export async function destroyUserLoginSessions(userId: string): Promise<number> {
  try {
    return await prisma.$executeRaw`
      DELETE FROM session WHERE sess->>'userId' = ${userId}
    `;
  } catch (error) {
    logger.error("Failed to clear login sessions for user", {
      err: error,
      userId,
    });
    return 0;
  }
}
