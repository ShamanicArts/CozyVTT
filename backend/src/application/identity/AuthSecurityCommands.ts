import crypto from "crypto";
import speakeasy from "speakeasy";
import qrcode from "qrcode";
import { Command, CommandHandler } from "../commands/CommandBus";
import {
  AuthSecurityRepository,
  AuthSecurityUser,
} from "../../ports/AuthSecurityRepository";
import { PasswordResetNotifier } from "../../ports/PasswordResetNotifier";
import { IdentityError } from "../../domain/identity/Identity";
import type { PasswordHasher } from "../../ports/PasswordHasher";
import { validatePasswordStrength } from "../../utils/validation";
export type ForgotPasswordCommand = Command<{ smtp: boolean }> & { email?: unknown };
export type ResetPasswordCommand = Command<void> & {
  token?: string;
  newPassword?: string;
};
export type ChangePasswordCommand = Command<void> & {
  userId: string;
  currentPassword?: string;
  newPassword?: string;
};
export type DeleteAccountCommand = Command<void> & {
  userId: string;
  password?: string;
};
export type MfaUserCommand = Command<{ qrCodeUrl: string }> & { userId: string };
export type MfaVerifyCommand = Command<string[]> & { userId: string; token?: unknown };
export type MfaLoginCommand = Command<{
  user: AuthSecurityUser;
  backupCodeUsed: boolean;
  remainingBackupCodes?: number;
}> & { userId: string; token?: unknown; backupCode?: unknown };
export type MfaDisableCommand = Command<void> & {
  userId: string;
  password?: string;
  token?: unknown;
};
export type MfaBackupCodesCommand = Command<string[]> & {
  userId: string;
  password?: string;
};
export const FORGOT_PASSWORD = "identity.forgot-password" as const,
  RESET_PASSWORD = "identity.reset-password" as const,
  CHANGE_PASSWORD = "identity.change-password" as const,
  DELETE_ACCOUNT = "identity.delete-account" as const,
  MFA_SETUP = "identity.mfa-setup" as const,
  MFA_VERIFY = "identity.mfa-verify" as const,
  MFA_VERIFY_LOGIN = "identity.mfa-verify-login" as const,
  MFA_DISABLE = "identity.mfa-disable" as const,
  MFA_BACKUP_CODES = "identity.mfa-backup-codes" as const;
const err = (s: 400 | 401 | 403 | 404, e: string, m: string) =>
  new IdentityError(s, e, m);
const codes = () =>
  Array.from({ length: 10 }, () =>
    crypto.randomBytes(4).toString("hex").toUpperCase(),
  );
const hash = (x: string) => crypto.createHash("sha256").update(x).digest("hex");
const valid = (s: string, t: unknown) =>
  speakeasy.totp.verify({
    secret: s,
    encoding: "base32",
    token: String(t),
    window: 1,
  });
export class ForgotPassword implements CommandHandler<
  ForgotPasswordCommand,
  { smtp: boolean }
> {
  constructor(
    private r: AuthSecurityRepository,
    private n: PasswordResetNotifier,
  ) {}
  async execute(c: ForgotPasswordCommand): Promise<{ smtp: boolean }> {
    if (!c.email) throw err(400, "Validation Error", "Email is required");
    const u = await this.r.findUserByEmail(String(c.email).toLowerCase());
    if (u) {
      const t = crypto.randomUUID();
      await this.r.createResetToken(u.id, t, new Date(Date.now() + 3600000));
      if (this.n.isConfigured())
        try {
          await this.n.send(u.email, t, u.displayName);
        } catch {}
    }
    return { smtp: this.n.isConfigured() };
  }
}
export class ResetPassword implements CommandHandler<
  ResetPasswordCommand,
  void
> {
  constructor(
    private r: AuthSecurityRepository,
    private passwords: PasswordHasher,
  ) {}
  async execute(c: ResetPasswordCommand): Promise<void> {
    if (!c.token || !c.newPassword)
      throw err(400, "Validation Error", "Token and new password are required");
    const t = await this.r.findResetToken(c.token);
    if (!t || t.used || t.expiresAt < new Date())
      throw err(
        400,
        "Invalid Token",
        "This password reset link is invalid or has expired",
      );
    const v = validatePasswordStrength(c.newPassword);
    if (!v.valid) throw err(400, "Validation Error", v.errors.join(", "));
    await this.r.updatePassword(t.userId, await this.passwords.hash(c.newPassword));
    await this.r.markResetUsed(t.id);
  }
}
export class ChangePassword implements CommandHandler<
  ChangePasswordCommand,
  void
> {
  constructor(
    private r: AuthSecurityRepository,
    private passwords: PasswordHasher,
  ) {}
  async execute(c: ChangePasswordCommand): Promise<void> {
    if (!c.currentPassword || !c.newPassword)
      throw err(
        400,
        "Validation Error",
        "Current password and new password are required",
      );
    const u = await this.r.findUser(c.userId);
    if (!u) throw err(404, "Not Found", "User not found");
    if (!(await this.passwords.verify(u.passwordHash, c.currentPassword)))
      throw err(401, "Authentication Failed", "Current password is incorrect");
    const v = validatePasswordStrength(c.newPassword);
    if (!v.valid) throw err(400, "Validation Error", v.errors.join(", "));
    await this.r.updatePassword(u.id, await this.passwords.hash(c.newPassword));
  }
}
export class DeleteAccount implements CommandHandler<
  DeleteAccountCommand,
  void
> {
  constructor(
    private r: AuthSecurityRepository,
    private passwords: PasswordHasher,
  ) {}
  async execute(c: DeleteAccountCommand): Promise<void> {
    if (!c.password)
      throw err(
        400,
        "Validation Error",
        "Password is required to delete your account",
      );
    const u = await this.r.findUser(c.userId);
    if (!u) throw err(404, "Not Found", "User not found");
    if (!(await this.passwords.verify(u.passwordHash, c.password)))
      throw err(401, "Authentication Failed", "Incorrect password");
    await this.r.deleteUser(u.id);
  }
}
export class MfaSetup implements CommandHandler<
  MfaUserCommand,
  { qrCodeUrl: string }
> {
  constructor(private r: AuthSecurityRepository) {}
  async execute(c: MfaUserCommand): Promise<{ qrCodeUrl: string }> {
    const u = await this.r.findUser(c.userId);
    if (!u) throw err(404, "Not Found", "User not found");
    if (u.mfaEnabled)
      throw err(
        400,
        "Bad Request",
        "MFA is already enabled. Disable it first to set it up again.",
      );
    const secret = speakeasy.generateSecret({
      name: `CozyVTT:${u.email}`,
      length: 20,
    });
    await this.r.updateMfa(u.id, { mfaSecret: secret.base32 });
    const url = speakeasy.otpauthURL({
      secret: secret.base32,
      encoding: "base32",
      issuer: "CozyVTT",
      label: u.email,
    });
    return { qrCodeUrl: await qrcode.toDataURL(url) };
  }
}
export class MfaVerify implements CommandHandler<MfaVerifyCommand, string[]> {
  constructor(private r: AuthSecurityRepository) {}
  async execute(c: MfaVerifyCommand): Promise<string[]> {
    if (!c.token)
      throw err(400, "Validation Error", "Verification code is required");
    const u = await this.r.findUser(c.userId);
    if (!u) throw err(404, "Not Found", "User not found");
    if (!u.mfaSecret)
      throw err(
        400,
        "Bad Request",
        "No MFA setup in progress. Call /mfa/setup first.",
      );
    if (u.mfaEnabled) throw err(400, "Bad Request", "MFA is already enabled");
    if (!valid(u.mfaSecret, c.token))
      throw err(
        401,
        "Invalid Code",
        "Invalid verification code. Please try again.",
      );
    const x = codes();
    await this.r.updateMfa(u.id, {
      mfaEnabled: true,
      mfaBackupCodes: x.map(hash),
    });
    return x;
  }
}
export class MfaVerifyLogin implements CommandHandler<
  MfaLoginCommand,
  {
    user: AuthSecurityUser;
    backupCodeUsed: boolean;
    remainingBackupCodes?: number;
  }
> {
  constructor(private r: AuthSecurityRepository) {}
  async execute(
    c: MfaLoginCommand,
  ): Promise<{
    user: AuthSecurityUser;
    backupCodeUsed: boolean;
    remainingBackupCodes?: number;
  }> {
    if (!c.token && !c.backupCode)
      throw err(
        400,
        "Validation Error",
        "Either a TOTP token or backup code is required",
      );
    const u = await this.r.findUser(c.userId);
    if (!u || !u.mfaEnabled || !u.mfaSecret)
      throw err(401, "Unauthorized", "Invalid MFA state");
    if (c.token) {
      if (!valid(u.mfaSecret, c.token))
        throw err(
          401,
          "Invalid Code",
          "Invalid authentication code. Please try again.",
        );
      return { user: u, backupCodeUsed: false };
    }
    const h = hash(String(c.backupCode).replace(/[-\s]/g, "").toUpperCase()),
      i = u.mfaBackupCodes.indexOf(h);
    if (i < 0)
      throw err(401, "Invalid Code", "Invalid backup code. Please try again.");
    const xs = u.mfaBackupCodes.filter((_, n) => n !== i);
    await this.r.updateMfa(u.id, { mfaBackupCodes: xs });
    return { user: u, backupCodeUsed: true, remainingBackupCodes: xs.length };
  }
}
export class MfaDisable implements CommandHandler<MfaDisableCommand, void> {
  constructor(
    private r: AuthSecurityRepository,
    private passwords: PasswordHasher,
  ) {}
  async execute(c: MfaDisableCommand): Promise<void> {
    if (!c.password || !c.token)
      throw err(
        400,
        "Validation Error",
        "Password and authentication code are required",
      );
    const u = await this.r.findUser(c.userId);
    if (!u) throw err(404, "Not Found", "User not found");
    if (u.platformRole === "ADMIN")
      throw err(403, "Forbidden", "Admin accounts must keep MFA enabled.");
    if (!u.mfaEnabled || !u.mfaSecret)
      throw err(400, "Bad Request", "MFA is not enabled");
    if (!(await this.passwords.verify(u.passwordHash, c.password)))
      throw err(401, "Authentication Failed", "Incorrect password");
    if (!valid(u.mfaSecret, c.token))
      throw err(401, "Invalid Code", "Invalid authentication code");
    await this.r.updateMfa(u.id, {
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: [],
    });
  }
}
export class MfaBackupCodes implements CommandHandler<
  MfaBackupCodesCommand,
  string[]
> {
  constructor(
    private r: AuthSecurityRepository,
    private passwords: PasswordHasher,
  ) {}
  async execute(c: MfaBackupCodesCommand): Promise<string[]> {
    if (!c.password) throw err(400, "Validation Error", "Password is required");
    const u = await this.r.findUser(c.userId);
    if (!u) throw err(404, "Not Found", "User not found");
    if (!u.mfaEnabled) throw err(400, "Bad Request", "MFA is not enabled");
    if (!(await this.passwords.verify(u.passwordHash, c.password)))
      throw err(401, "Authentication Failed", "Incorrect password");
    const x = codes();
    await this.r.updateMfa(u.id, { mfaBackupCodes: x.map(hash) });
    return x;
  }
}
