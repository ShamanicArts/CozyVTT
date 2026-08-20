import crypto from "crypto";
import { sanitizeInput, validateEmail } from "../../utils/validation";
import {
  AdminActor,
  AdminCommandError,
  AdminSettingsUpdate,
  AdminUser,
  BackupSummary,
  adminError,
} from "../../domain/admin/Admin";
import { AdminAdministrationRepository } from "../../ports/AdminAdministrationRepository";
import { AdminAuditLog } from "../../ports/AdminAuditLog";
import { AdminBackupStore } from "../../ports/AdminBackupStore";
import { AdminMailer } from "../../ports/AdminMailer";
import { AdminPasswordHasher } from "../../ports/AdminPasswordHasher";
import { Command, CommandHandler } from "../commands/CommandBus";

export const UPDATE_ADMIN_SETTINGS = "admin.settings.update" as const;
export const CREATE_ADMIN_USER = "admin.user.create" as const;
export const APPROVE_ADMIN_USER = "admin.user.approve" as const;
export const RESET_ADMIN_USER_MFA = "admin.user.reset-mfa" as const;
export const SEND_ADMIN_SMTP_TEST = "admin.smtp.test" as const;
export const CREATE_ADMIN_BACKUP = "admin.backup.create" as const;
export const DELETE_ADMIN_BACKUP = "admin.backup.delete" as const;
export const RESTORE_ADMIN_BACKUP = "admin.backup.restore" as const;

export interface UpdateAdminSettingsCommand extends Command<
  Record<string, unknown>
> {
  readonly type: typeof UPDATE_ADMIN_SETTINGS;
  readonly actor: AdminActor;
  readonly input: Record<string, unknown>;
}
export interface CreateAdminUserCommand extends Command<{
  user: AdminUser;
  temporaryPassword: string;
}> {
  readonly type: typeof CREATE_ADMIN_USER;
  readonly actor: AdminActor;
  readonly input: Record<string, unknown>;
}
export interface ApproveAdminUserCommand extends Command<void> {
  readonly type: typeof APPROVE_ADMIN_USER;
  readonly actor: AdminActor;
  readonly userId: string;
}
export interface ResetAdminUserMfaCommand extends Command<void> {
  readonly type: typeof RESET_ADMIN_USER_MFA;
  readonly actor: AdminActor;
  readonly userId: string;
}
export interface SendAdminSmtpTestCommand extends Command<{ email: string }> {
  readonly type: typeof SEND_ADMIN_SMTP_TEST;
  readonly actor: AdminActor;
}
export interface CreateAdminBackupCommand extends Command<BackupSummary> {
  readonly type: typeof CREATE_ADMIN_BACKUP;
  readonly actor: AdminActor;
}
export interface DeleteAdminBackupCommand extends Command<void> {
  readonly type: typeof DELETE_ADMIN_BACKUP;
  readonly actor: AdminActor;
  readonly filename: string;
}
export interface RestoreAdminBackupCommand extends Command<void> {
  readonly type: typeof RESTORE_ADMIN_BACKUP;
  readonly actor: AdminActor;
  readonly uploadedZip: string;
}

abstract class AdminCommandBase {
  constructor(
    protected readonly repository: AdminAdministrationRepository,
    protected readonly audit: AdminAuditLog,
  ) {}
  protected async log(
    actor: AdminActor,
    message: string,
    level: "INFO" | "WARNING" = "INFO",
    context?: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record(actor.userId, message, level, context);
  }
}

export class UpdateAdminSettings
  extends AdminCommandBase
  implements CommandHandler<UpdateAdminSettingsCommand, Record<string, unknown>>
{
  async execute(
    command: UpdateAdminSettingsCommand,
  ): Promise<Record<string, unknown>> {
    const data = normalizeSettings(command.input);
    const settings = await this.repository.updateSettings(data);
    await this.log(
      command.actor,
      `Updated system settings: ${Object.keys(data).join(", ")}`,
      "INFO",
      { changes: data },
    );
    return settings;
  }
}

export class CreateAdminUser
  extends AdminCommandBase
  implements
    CommandHandler<
      CreateAdminUserCommand,
      { user: AdminUser; temporaryPassword: string }
    >
{
  constructor(
    repository: AdminAdministrationRepository,
    audit: AdminAuditLog,
    private readonly passwords: AdminPasswordHasher,
    private readonly mailer: AdminMailer,
  ) {
    super(repository, audit);
  }
  async execute(
    command: CreateAdminUserCommand,
  ): Promise<{ user: AdminUser; temporaryPassword: string }> {
    const email = command.input.email;
    if (!email || typeof email !== "string")
      throw adminError(400, "Bad Request", "Email is required");
    if (!validateEmail(email))
      throw adminError(400, "Bad Request", "Invalid email address");
    const normalizedEmail = email.toLowerCase();
    if (await this.repository.findUserByEmail(normalizedEmail))
      throw adminError(409, "Conflict", "Email is already in use");
    const role = command.input.platformRole === "ADMIN" ? "ADMIN" : "USER";
    const temporaryPassword = generateTemporaryPassword();
    const rawName =
      typeof command.input.displayName === "string" &&
      command.input.displayName.trim()
        ? command.input.displayName
        : email.split("@")[0];
    const user = await this.repository.createUser({
      email: sanitizeInput(email).toLowerCase(),
      displayName: sanitizeInput(rawName).slice(0, 50),
      passwordHash: await this.passwords.hash(temporaryPassword),
      platformRole: role,
      mustChangePassword: true,
    });
    await this.log(
      command.actor,
      `Created user ${user.email} with role ${role}`,
      "INFO",
      { targetUserId: user.id, role },
    );
    if (this.mailer.isConfigured())
      void this.mailer
        .sendWelcomeEmail(user.email, user.displayName, temporaryPassword)
        .catch(() => {});
    return { user, temporaryPassword };
  }
}

export class ApproveAdminUser
  extends AdminCommandBase
  implements CommandHandler<ApproveAdminUserCommand, void>
{
  async execute(command: ApproveAdminUserCommand): Promise<void> {
    const user = await this.repository.findUserById(command.userId);
    if (!user) throw adminError(404, "Not Found", "User not found");
    if (user.isApproved)
      throw adminError(400, "Bad Request", "User is already approved");
    await this.repository.approveUser(user.id);
    await this.log(
      command.actor,
      `Approved account for user ${user.email}`,
      "INFO",
      { targetUserId: user.id },
    );
  }
}

export class ResetAdminUserMfa
  extends AdminCommandBase
  implements CommandHandler<ResetAdminUserMfaCommand, void>
{
  async execute(command: ResetAdminUserMfaCommand): Promise<void> {
    const user = await this.repository.findUserById(command.userId);
    if (!user) throw adminError(404, "Not Found", "User not found");
    if (!user.mfaEnabled)
      throw adminError(400, "Bad Request", "MFA is not enabled for this user");
    await this.repository.resetUserMfa(user.id);
    await this.log(
      command.actor,
      `Reset MFA for user ${user.email}`,
      "WARNING",
      { targetUserId: user.id },
    );
  }
}

export class SendAdminSmtpTest
  extends AdminCommandBase
  implements CommandHandler<SendAdminSmtpTestCommand, { email: string }>
{
  constructor(
    repository: AdminAdministrationRepository,
    audit: AdminAuditLog,
    private readonly mailer: AdminMailer,
  ) {
    super(repository, audit);
  }
  async execute(command: SendAdminSmtpTestCommand): Promise<{ email: string }> {
    if (!this.mailer.isConfigured())
      throw adminError(
        400,
        "Bad Request",
        "SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables.",
      );
    const user = await this.repository.findUserById(command.actor.userId);
    if (!user) throw adminError(404, "Not Found", "Admin user not found");
    try {
      await this.mailer.sendTestEmail(user.email, user.displayName);
    } catch (error: any) {
      throw adminError(
        500,
        "SMTP Error",
        error.message || "Failed to send test email",
      );
    }
    await this.log(command.actor, `Sent SMTP test email to ${user.email}`);
    return { email: user.email };
  }
}

abstract class AdminBackupCommandBase extends AdminCommandBase {
  constructor(
    repository: AdminAdministrationRepository,
    audit: AdminAuditLog,
    protected readonly backups: AdminBackupStore,
  ) {
    super(repository, audit);
  }
}

export class CreateAdminBackup
  extends AdminBackupCommandBase
  implements CommandHandler<CreateAdminBackupCommand, BackupSummary>
{
  async execute(command: CreateAdminBackupCommand): Promise<BackupSummary> {
    const backup = await this.backups.create();
    await this.log(
      command.actor,
      `Created instance backup: ${backup.filename}`,
      "INFO",
      { filename: backup.filename, sizeBytes: backup.sizeBytes },
    );
    return backup;
  }
}

export class DeleteAdminBackup
  extends AdminBackupCommandBase
  implements CommandHandler<DeleteAdminBackupCommand, void>
{
  async execute(command: DeleteAdminBackupCommand): Promise<void> {
    if (!isBackupFilename(command.filename))
      throw adminError(400, "Bad Request", "Invalid backup filename");
    if (!(await this.backups.delete(command.filename)))
      throw adminError(404, "Not Found", "Backup file not found");
    await this.log(
      command.actor,
      `Deleted backup: ${command.filename}`,
      "INFO",
      { filename: command.filename },
    );
  }
}

export class RestoreAdminBackup
  extends AdminBackupCommandBase
  implements CommandHandler<RestoreAdminBackupCommand, void>
{
  async execute(command: RestoreAdminBackupCommand): Promise<void> {
    await this.backups.restore(command.uploadedZip);
    await this.log(
      command.actor,
      "Restored instance from backup",
      "WARNING",
      {},
    );
  }
}

function normalizeSettings(
  input: Record<string, unknown>,
): AdminSettingsUpdate {
  const data: AdminSettingsUpdate = {};
  if (typeof input.instanceName === "string")
    data.instanceName = sanitizeInput(input.instanceName).slice(0, 100);
  if (typeof input.timezone === "string")
    data.timezone = sanitizeInput(input.timezone).slice(0, 50);
  if (typeof input.allowRegistration === "boolean")
    data.allowRegistration = input.allowRegistration;
  if (typeof input.requireAdminApproval === "boolean")
    data.requireAdminApproval = input.requireAdminApproval;
  if (typeof input.themeId === "string")
    data.themeId = sanitizeInput(input.themeId).slice(0, 50);
  if (input.customThemeColors !== undefined)
    data.customThemeColors = input.customThemeColors;
  if (typeof input.fontId === "string")
    data.fontId = sanitizeInput(input.fontId).slice(0, 50);
  if (input.customLogoUrl !== undefined)
    data.customLogoUrl =
      typeof input.customLogoUrl === "string" ? input.customLogoUrl : null;
  if (input.customFaviconUrl !== undefined)
    data.customFaviconUrl =
      typeof input.customFaviconUrl === "string"
        ? input.customFaviconUrl
        : null;
  if (input.customMascotUrl !== undefined)
    data.customMascotUrl =
      typeof input.customMascotUrl === "string" ? input.customMascotUrl : null;
  return data;
}

function generateTemporaryPassword(): string {
  const cleaned = crypto
    .randomBytes(16)
    .toString("base64")
    .replace(/[+/=]/g, "");
  const value = (cleaned + "AAAAAAAAAAAAAAAA").slice(0, 16).toUpperCase();
  return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}`;
}

function isBackupFilename(filename: string): boolean {
  return /^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.zip$/.test(filename);
}

export function isAdminCommandError(
  error: unknown,
): error is AdminCommandError {
  return error instanceof AdminCommandError;
}
