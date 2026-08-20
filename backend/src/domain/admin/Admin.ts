/** Transport- and ORM-neutral administration contracts. */
export interface AdminActor {
  userId: string;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  platformRole: "ADMIN" | "USER";
  isApproved: boolean;
  mfaEnabled: boolean;
  [key: string]: unknown;
}

export interface AdminSettingsUpdate {
  instanceName?: string;
  timezone?: string;
  allowRegistration?: boolean;
  requireAdminApproval?: boolean;
  themeId?: string;
  customThemeColors?: unknown;
  fontId?: string;
  customLogoUrl?: string | null;
  customFaviconUrl?: string | null;
  customMascotUrl?: string | null;
}

export interface BackupSummary {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export class AdminCommandError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 500,
    public readonly error:
      | "Bad Request"
      | "Not Found"
      | "Conflict"
      | "Configuration Error"
      | "Tool Not Available"
      | "Backup Failed"
      | "Restore Failed"
      | "SMTP Error"
      | "Internal Server Error"
      | "Invalid Backup",
    message: string,
  ) {
    super(message);
    this.name = "AdminCommandError";
  }
}

export const adminError = (
  status: AdminCommandError["status"],
  error: AdminCommandError["error"],
  message: string,
) => new AdminCommandError(status, error, message);
