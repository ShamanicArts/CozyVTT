export interface AdminMailer {
  isConfigured(): boolean;
  sendTestEmail(email: string, displayName: string): Promise<void>;
  sendWelcomeEmail(
    email: string,
    displayName: string,
    temporaryPassword: string,
  ): Promise<void>;
}
