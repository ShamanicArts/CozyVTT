import { AdminMailer } from "../../ports/AdminMailer";
import {
  isSmtpConfigured,
  sendTestEmail,
  sendWelcomeEmail,
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
}
