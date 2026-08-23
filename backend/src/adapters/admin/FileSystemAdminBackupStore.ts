import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { createWriteStream } from "fs";
import fs from "fs/promises";
import path from "path";
import archiver from "archiver";
import unzipper from "unzipper";
import {
  AdminCommandError,
  BackupSummary,
  adminError,
} from "../../domain/admin/Admin";
import { AdminBackupQueryStore, AdminBackupStore } from "../../ports/AdminPorts";
import { extractArchiveSafely } from "../../utils/archive";

const execFileAsync = promisify(execFile);

/** Filesystem/Postgres-client adapter for full instance backup lifecycle. */
export class FileSystemAdminBackupStore
  implements AdminBackupStore, AdminBackupQueryStore
{
  constructor(
    private readonly uploadsDir: string,
    private readonly backupDir: string,
    private readonly databaseUrl: string | undefined,
    private readonly maxRestoreFiles: number,
    private readonly maxRestoreBytes: number,
  ) {}

  async create(): Promise<BackupSummary> {
    await fs.mkdir(this.backupDir, { recursive: true });
    if (!this.databaseUrl)
      throw adminError(500, "Configuration Error", "DATABASE_URL is not set");

    const timestamp = new Date()
      .toISOString()
      .replace(/:/g, "-")
      .replace(/\..+/, "");
    const filename = `backup-${timestamp}.zip`;
    const zipPath = path.join(this.backupDir, filename);
    const sqlPath = path.join(os.tmpdir(), `cozyvtt-db-${Date.now()}.sql`);
    try {
      try {
        await execFileAsync("pg_dump", [
          "--dbname",
          this.databaseUrl,
          "--file",
          sqlPath,
          "--clean",
          "--if-exists",
        ]);
      } catch (error: any) {
        if (error.code === "ENOENT")
          throw adminError(
            500,
            "Tool Not Available",
            "pg_dump is not installed. Rebuild the backend Docker image to include postgresql-client.",
          );
        throw adminError(
          500,
          "Backup Failed",
          "Database dump failed. Check server logs for details.",
        );
      }

      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 6 } });
        output.on("close", resolve);
        output.on("error", reject);
        archive.on("error", reject);
        archive.pipe(output);
        archive.file(sqlPath, { name: "database.sql" });
        archive.directory(this.uploadsDir, "uploads", (entry) =>
          entry.name.startsWith("backups/") ? false : entry,
        );
        void archive.finalize();
      });
      await fs.unlink(sqlPath).catch(() => {});
      const stat = await fs.stat(zipPath);
      return {
        filename,
        sizeBytes: stat.size,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      await fs.unlink(zipPath).catch(() => {});
      await fs.unlink(sqlPath).catch(() => {});
      if (error instanceof AdminCommandError) throw error;
      throw adminError(500, "Internal Server Error", "Failed to create backup");
    }
  }

  async delete(filename: string): Promise<boolean> {
    try {
      await fs.unlink(path.join(this.backupDir, filename));
      return true;
    } catch {
      return false;
    }
  }

  async list(): Promise<BackupSummary[]> {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      const files = await fs.readdir(this.backupDir);
      const backups = await Promise.all(
        files
          .filter((filename) => /^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.zip$/.test(filename))
          .map(async (filename) => {
            const stat = await fs.stat(path.join(this.backupDir, filename));
            return {
              filename,
              sizeBytes: stat.size,
              createdAt: stat.mtime.toISOString(),
            };
          }),
      );
      return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }

  async read(filename: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(path.join(this.backupDir, filename));
    } catch {
      return null;
    }
  }

  async restore(uploadedZip: string): Promise<void> {
    const tempDir = path.join(os.tmpdir(), `cozyvtt-restore-${Date.now()}`);
    try {
      const directory = await unzipper.Open.file(uploadedZip);
      await extractArchiveSafely(directory, tempDir, {
        maxFiles: this.maxRestoreFiles,
        maxTotalBytes: this.maxRestoreBytes,
      });
      const sqlPath = path.join(tempDir, "database.sql");
      try {
        await fs.access(sqlPath);
      } catch {
        throw adminError(
          400,
          "Invalid Backup",
          "This file does not appear to be a valid CozyVTT backup (database.sql not found inside ZIP)",
        );
      }
      if (!this.databaseUrl)
        throw adminError(500, "Configuration Error", "DATABASE_URL is not set");
      try {
        await execFileAsync("psql", [
          "--dbname",
          this.databaseUrl,
          "--file",
          sqlPath,
        ]);
      } catch (error: any) {
        if (error.code === "ENOENT")
          throw adminError(
            500,
            "Tool Not Available",
            "psql is not installed. Rebuild the backend Docker image to include postgresql-client.",
          );
        throw adminError(
          500,
          "Restore Failed",
          "Database restore failed. Check server logs for details.",
        );
      }
      const extractedUploads = path.join(tempDir, "uploads");
      try {
        await fs.access(extractedUploads);
        await fs.cp(extractedUploads, this.uploadsDir, { recursive: true });
      } catch {
        /* DB-only archives are valid. */
      }
    } catch (error) {
      if (error instanceof AdminCommandError) throw error;
      throw adminError(
        500,
        "Restore Failed",
        "An unexpected error occurred during restore",
      );
    } finally {
      await fs.unlink(uploadedZip).catch(() => {});
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
