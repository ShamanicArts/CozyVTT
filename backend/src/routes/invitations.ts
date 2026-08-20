/**
 * Campaign Invitation Routes
 * Campaign Invitations
 */

import { Router, Response } from "express";
import { AuthenticatedRequest } from "../middleware/rbac";
import { authenticated } from "../middleware/compose";
import { prisma } from "../config/database";
import { broadcastToCampaign } from "../websocket/utils";
import logger from "../utils/logger";
import { productionCommandBus } from "../composition/productionApplicationHost";
import {
  ACCEPT_CAMPAIGN_INVITATION,
  DECLINE_CAMPAIGN_INVITATION,
  AcceptCampaignInvitation,
  AcceptCampaignInvitationCommand,
  DeclineCampaignInvitationCommand,
  isCampaignCommandError,
} from "../application/campaigns/CampaignCommands";

const router = Router();

const invitationCommands = productionCommandBus;

/**
 * GET /api/invitations
 * Get user's pending invitations
 */
router.get(
  "/",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.session.userId!;

      const invitations = await prisma.campaignInvitation.findMany({
        where: {
          userId,
          status: "PENDING",
        },
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              description: true,
              gameSystem: true,
              status: true,
              owner: {
                select: {
                  displayName: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return res.json(invitations);
    } catch (error) {
      logger.error("Error fetching invitations", { err: error });
      return res.status(500).json({ message: "Failed to fetch invitations" });
    }
  },
);

/**
 * POST /api/invitations/:id/accept
 * Accept invitation and join campaign with selected characters
 * Body: { characterIds: string[] }
 */
router.post(
  "/:id/accept",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { id: invitationId } = req.params;
      const { characterIds = [] } = req.body;

      const result = await invitationCommands.dispatch<
        AcceptCampaignInvitationCommand,
        Awaited<ReturnType<AcceptCampaignInvitation["execute"]>>
      >({
        type: ACCEPT_CAMPAIGN_INVITATION,
        invitationId,
        userId,
        characterIds,
      });

      // Broadcast roster.updated to campaign members
      try {
        broadcastToCampaign(result.invitation.campaignId, "roster.updated", {
          action: "member.joined",
          userId,
          campaignId: result.invitation.campaignId,
          characterIds,
        });
      } catch (error) {
        logger.error("Failed to broadcast roster update", { err: error });
        // Don't fail the request if broadcast fails
      }

      return res.json({
        message: "Invitation accepted",
        membership: result.membership,
      });
    } catch (error) {
      if (isCampaignCommandError(error))
        return res.status(error.status).json({ message: error.message });
      logger.error("Error accepting invitation", { err: error });
      return res.status(500).json({ message: "Failed to accept invitation" });
    }
  },
);

/**
 * POST /api/invitations/:id/decline
 * Decline invitation
 */
router.post(
  "/:id/decline",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { id: invitationId } = req.params;

      await invitationCommands.dispatch<DeclineCampaignInvitationCommand, void>(
        { type: DECLINE_CAMPAIGN_INVITATION, invitationId, userId },
      );

      return res.json({ message: "Invitation declined" });
    } catch (error) {
      if (isCampaignCommandError(error))
        return res.status(error.status).json({ message: error.message });
      logger.error("Error declining invitation", { err: error });
      return res.status(500).json({ message: "Failed to decline invitation" });
    }
  },
);

export default router;
