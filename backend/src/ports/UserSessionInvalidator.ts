export interface UserSessionInvalidator {
  invalidate(userId: string): Promise<void>;
}
