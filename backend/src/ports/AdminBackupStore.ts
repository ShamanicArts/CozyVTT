import { BackupSummary } from "../domain/admin/Admin";

export interface AdminBackupStore {
  create(): Promise<BackupSummary>;
  delete(filename: string): Promise<boolean>;
  restore(uploadedZip: string): Promise<void>;
}
