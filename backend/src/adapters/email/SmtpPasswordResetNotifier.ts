import { isSmtpConfigured, sendPasswordResetEmail } from "../../services/email";
import { PasswordResetNotifier } from "../../ports/PasswordResetNotifier";

export class SmtpPasswordResetNotifier implements PasswordResetNotifier {
  isConfigured(): boolean {
    return isSmtpConfigured();
  }
  send(email: string, token: string, displayName: string): Promise<void> {
    return sendPasswordResetEmail(email, token, displayName);
  }
}
