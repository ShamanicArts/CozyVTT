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
  approveUser(id: string): Promise<void>;
  resetUserMfa(id: string): Promise<void>;
}
