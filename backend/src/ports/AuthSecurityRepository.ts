export interface AuthSecurityUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  platformRole: "ADMIN" | "USER";
  mfaEnabled: boolean;
  mfaSecret: string | null;
  mfaBackupCodes: string[];
  mustChangePassword: boolean;
}
export interface PasswordResetRecord {
  id: string;
  userId: string;
  used: boolean;
  expiresAt: Date;
}
export interface AuthSecurityRepository {
  findUser(id: string): Promise<AuthSecurityUser | null>;
  findUserByEmail(email: string): Promise<AuthSecurityUser | null>;
  findResetToken(token: string): Promise<PasswordResetRecord | null>;
  createResetToken(
    userId: string,
    token: string,
    expiresAt: Date,
  ): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  markResetUsed(id: string): Promise<void>;
  deleteUser(id: string): Promise<void>;
  updateMfa(
    id: string,
    input: {
      mfaEnabled?: boolean;
      mfaSecret?: string | null;
      mfaBackupCodes?: string[];
    },
  ): Promise<void>;
}
