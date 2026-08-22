import { AdminMailer } from "../../ports/AdminPorts";
import {
  isSmtpConfigured,
  sendTestEmail,
  sendWelcomeEmail,
  sendInvitationEmail,
} from "../../services/email";

export class ServiceAdminMailer implements AdminMailer {
  isConfigured(): boolean {
    return isSmtpConfigured();
  }
  async sendTestEmail(email: string, displayName: string): Promise<void> {
    await sendTestEmail(email, displayName);
  }
  async sendWelcomeEmail(
    email: string,
    displayName: string,
    temporaryPassword: string,
  ): Promise<void> {
    await sendWelcomeEmail(email, displayName, temporaryPassword);
  }
  async sendInvitationEmail(
    email: string,
    token: string,
    displayName: string,
    invitedByName: string,
    expiryDays: number,
  ): Promise<void> {
    await sendInvitationEmail(
      email,
      token,
      displayName,
      invitedByName,
      expiryDays,
    );
  }
}
