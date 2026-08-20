export interface PasswordResetNotifier {
  isConfigured(): boolean;
  send(email: string, token: string, displayName: string): Promise<void>;
}
