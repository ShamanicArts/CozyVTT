import crypto from "crypto";
import { Command, CommandHandler } from "../commands/CommandBus";
import { UserMutationError } from "../../domain/users/UserMutations";
import { PasswordResetNotifier } from "../../ports/PasswordResetNotifier";
import {
  UserMutationRepository,
  UserProfileUpdate,
} from "../../ports/UserMutationRepository";
import type { UserSessionInvalidator } from "../../ports/UserSessionInvalidator";
import type { PasswordHasher } from "../../ports/PasswordHasher";
import { sanitizeInput, validateEmail } from "../../utils/validation";
import {
  isBuiltInThemeId,
  UpdateUserPreferencesSchema,
  UserPreferences,
} from "../../validators/userPreferences";

export const UPDATE_USER_PROFILE = "user.update-profile" as const;
export const UPDATE_USER_PREFERENCES = "user.update-preferences" as const;
export const DELETE_USER_AS_ADMIN = "user.admin-delete" as const;
export const RESET_USER_PASSWORD_AS_ADMIN =
  "user.admin-reset-password" as const;
export const SEND_USER_PASSWORD_RESET_LINK =
  "user.send-password-reset-link" as const;

export interface UpdateUserProfileCommand extends Command<object> {
  readonly type: typeof UPDATE_USER_PROFILE;
  readonly actorId: string;
  readonly isAdmin: boolean;
  readonly userId: string;
  readonly input: Record<string, unknown>;
}
export interface UpdateUserPreferencesCommand extends Command<unknown> {
  readonly type: typeof UPDATE_USER_PREFERENCES;
  readonly actorId: string;
  readonly isAdmin: boolean;
  readonly userId: string;
  readonly input: unknown;
}
export interface ActiveThemeCatalog {
  hasActiveTheme(themeId: string): Promise<boolean>;
}
export interface DeleteUserAsAdminCommand extends Command<number> {
  readonly type: typeof DELETE_USER_AS_ADMIN;
  readonly actorId: string;
  readonly userId: string;
}
export interface ResetUserPasswordAsAdminCommand extends Command<string> {
  readonly type: typeof RESET_USER_PASSWORD_AS_ADMIN;
  readonly userId: string;
}
export interface SendUserPasswordResetLinkCommand extends Command<string> {
  readonly type: typeof SEND_USER_PASSWORD_RESET_LINK;
  readonly userId: string;
}

export class UpdateUserProfile implements CommandHandler<
  UpdateUserProfileCommand,
  object
> {
  constructor(private readonly users: UserMutationRepository) {}
  async execute(command: UpdateUserProfileCommand): Promise<object> {
    if (command.userId !== command.actorId && !command.isAdmin) {
      throw new UserMutationError(
        403,
        "Forbidden",
        "You do not have permission to update this user",
      );
    }
    const existing = await this.users.findUser(command.userId);
    if (!existing)
      throw new UserMutationError(404, "Not Found", "User not found");
    const {
      displayName,
      email,
      avatarUrl,
      platformRole,
      bio,
      globalAssetManager,
    } = command.input;
    const update: UserProfileUpdate = {};
    if (displayName !== undefined)
      update.displayName = sanitizeInput(displayName as string);
    if (email !== undefined) {
      if (!validateEmail(email as string))
        throw new UserMutationError(400, "Bad Request", "Invalid email format");
      const emailValue = (email as string).toLowerCase();
      const existingEmail = await this.users.findUserByEmail(emailValue);
      if (existingEmail && existingEmail.id !== command.userId) {
        throw new UserMutationError(400, "Bad Request", "Email already in use");
      }
      update.email = emailValue;
    }
    if (avatarUrl !== undefined) update.avatarUrl = avatarUrl;
    if (bio !== undefined)
      update.bio =
        bio === null ? null : sanitizeInput(String(bio)).slice(0, 500);
    if (platformRole !== undefined) {
      if (!command.isAdmin)
        throw new UserMutationError(
          403,
          "Forbidden",
          "Only admins can update platform roles",
        );
      if (platformRole !== "ADMIN" && platformRole !== "USER")
        throw new UserMutationError(
          400,
          "Bad Request",
          "Invalid platform role",
        );
      update.platformRole = platformRole;
    }
    if (globalAssetManager !== undefined) {
      if (!command.isAdmin)
        throw new UserMutationError(
          403,
          "Forbidden",
          "Only admins can update the global asset manager permission",
        );
      if (typeof globalAssetManager !== "boolean")
        throw new UserMutationError(
          400,
          "Bad Request",
          "globalAssetManager must be a boolean",
        );
      update.globalAssetManager = globalAssetManager;
    }
    return this.users.updateUser(command.userId, update);
  }
}

export class UpdateUserPreferences implements CommandHandler<
  UpdateUserPreferencesCommand,
  unknown
> {
  constructor(
    private readonly users: UserMutationRepository,
    private readonly themes: ActiveThemeCatalog = {
      hasActiveTheme: async () => false,
    },
  ) {}
  async execute(command: UpdateUserPreferencesCommand): Promise<unknown> {
    if (command.userId !== command.actorId && !command.isAdmin) {
      throw new UserMutationError(
        403,
        "Forbidden",
        "You do not have permission to update this user's preferences",
      );
    }
    const parsed = UpdateUserPreferencesSchema.safeParse(command.input);
    if (!parsed.success)
      throw new UserMutationError(
        400,
        "Bad Request",
        "Invalid preferences payload",
        parsed.error.flatten(),
      );
    if (
      parsed.data.themeId &&
      !isBuiltInThemeId(parsed.data.themeId) &&
      !(await this.themes.hasActiveTheme(parsed.data.themeId))
    ) {
      throw new UserMutationError(
        400,
        "Bad Request",
        "Invalid preferences payload",
        { fieldErrors: { themeId: ["Theme is not currently available"] } },
      );
    }
    const current = await this.users.findPreferences(command.userId);
    if (!current.exists)
      throw new UserMutationError(404, "Not Found", "User not found");
    const merged: UserPreferences = {
      ...((current.preferences as UserPreferences | null) ?? {}),
      ...parsed.data,
    };
    return this.users.updatePreferences(command.userId, merged);
  }
}

export class DeleteUserAsAdmin implements CommandHandler<
  DeleteUserAsAdminCommand,
  number
> {
  constructor(
    private readonly users: UserMutationRepository,
    private readonly sessions: UserSessionInvalidator,
  ) {}
  async execute(command: DeleteUserAsAdminCommand): Promise<number> {
    if (command.userId === command.actorId)
      throw new UserMutationError(
        400,
        "Bad Request",
        "You cannot delete your own account",
      );
    const user = await this.users.findUser(command.userId);
    if (!user) throw new UserMutationError(404, "Not Found", "User not found");
    const userAssetCount = await this.users.countUserAssets(command.userId);
    await this.users.deleteUser(command.userId);
    await this.sessions.invalidate(command.userId);
    return userAssetCount;
  }
}

export class ResetUserPasswordAsAdmin implements CommandHandler<
  ResetUserPasswordAsAdminCommand,
  string
> {
  constructor(
    private readonly users: UserMutationRepository,
    private readonly passwords: PasswordHasher,
  ) {}
  async execute(command: ResetUserPasswordAsAdminCommand): Promise<string> {
    if (!(await this.users.findUser(command.userId)))
      throw new UserMutationError(404, "Not Found", "User not found");
    const temporaryPassword = generateTemporaryPassword();
    await this.users.updateUser(command.userId, {
      passwordHash: await this.passwords.hash(temporaryPassword),
      mustChangePassword: true,
    } as UserProfileUpdate);
    return temporaryPassword;
  }
}

export class SendUserPasswordResetLink implements CommandHandler<
  SendUserPasswordResetLinkCommand,
  string
> {
  constructor(
    private readonly users: UserMutationRepository,
    private readonly notifier: PasswordResetNotifier,
  ) {}
  async execute(command: SendUserPasswordResetLinkCommand): Promise<string> {
    if (!this.notifier.isConfigured()) {
      throw new UserMutationError(
        503,
        "Service Unavailable",
        "SMTP is not configured on this instance. Configure SMTP in your .env to use this feature.",
      );
    }
    const user = await this.users.findUser(command.userId);
    if (!user) throw new UserMutationError(404, "Not Found", "User not found");
    await this.users.invalidateUnusedPasswordResetTokens(command.userId);
    const token = crypto.randomUUID();
    await this.users.createPasswordResetToken(
      command.userId,
      token,
      new Date(Date.now() + 60 * 60 * 1000),
    );
    await this.notifier.send(user.email, token, user.displayName);
    return user.email;
  }
}

function generateTemporaryPassword(): string {
  const cleaned = crypto
    .randomBytes(16)
    .toString("base64")
    .replace(/[+/=]/g, "");
  return (
    cleaned
      .substring(0, 16)
      .match(/.{1,4}/g)
      ?.join("-") || cleaned.substring(0, 16)
  );
}
