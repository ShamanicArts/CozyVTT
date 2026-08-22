import { AdminSettingsUpdate, AdminUser } from "../domain/admin/Admin";

export interface AdminAdministrationRepository {
  updateSettings(data: AdminSettingsUpdate): Promise<Record<string, unknown>>;
  findUserByEmail(email: string): Promise<AdminUser | null>;
  findUserById(id: string): Promise<AdminUser | null>;
  createUser(data: {
    email: string;
    displayName: string;
    passwordHash: string;
    platformRole: "ADMIN" | "USER";
    mustChangePassword: boolean;
  }): Promise<AdminUser>;
  deleteUser(id: string): Promise<void>;
  invalidatePasswordResetTokens(userId: string): Promise<void>;
  createPasswordResetToken(
    userId: string,
    token: string,
    expiresAt: Date,
  ): Promise<void>;
  approveUser(id: string): Promise<void>;
  resetUserMfa(id: string): Promise<void>;
}
