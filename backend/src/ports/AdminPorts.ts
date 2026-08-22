import { BackupSummary } from "../domain/admin/Admin";

export interface AdminAuditLog {
  record(
    actorId: string,
    message: string,
    level?: "INFO" | "WARNING" | "ERROR" | "CRITICAL",
    context?: Record<string, unknown>,
  ): Promise<void>;
}

export interface AdminBackupStore {
  create(): Promise<BackupSummary>;
  delete(filename: string): Promise<boolean>;
  restore(uploadedZip: string): Promise<void>;
}

export interface AdminMailer {
  isConfigured(): boolean;
  sendTestEmail(email: string, displayName: string): Promise<void>;
  sendWelcomeEmail(
    email: string,
    displayName: string,
    temporaryPassword: string,
  ): Promise<void>;
}

export interface AdminPasswordHasher {
  hash(password: string): Promise<string>;
}
