import type {
  CampaignInvitationNotification,
  CampaignInvitationNotifier,
} from "../../ports/CampaignInvitationNotifier";
import {
  isSmtpConfigured,
  sendCampaignInvitationEmail,
} from "../../services/email";
import { broadcastToUser } from "../../websocket/utils";
import logger from "../../utils/logger";

export class CampaignInvitationEventPublisher
  implements CampaignInvitationNotifier
{
  async notify(input: CampaignInvitationNotification): Promise<void> {
    try {
      broadcastToUser(input.invitedUserId, "invitation.received", {
        invitationId: input.invitationId,
        campaignId: input.campaignId,
        campaignName: input.campaignName,
        invitedBy: input.invitedBy,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to broadcast invitation", { err: error });
    }
    if (isSmtpConfigured())
      void sendCampaignInvitationEmail(
        input.invitedUserEmail,
        input.invitedUserDisplayName,
        input.campaignName,
        input.inviterDisplayName,
        input.campaignDescription,
      ).catch((error) =>
        logger.error("Failed to send campaign invitation email", { err: error }),
      );
  }
}
