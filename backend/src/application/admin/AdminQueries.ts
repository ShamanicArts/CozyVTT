import type { AdminBackupQueryStore, AdminMailer } from "../../ports/AdminPorts";
import type { AdminQueryRepository } from "../../ports/AdminQueryRepository";
import type { SystemSettingsRepository } from "../../ports/SystemSettingsRepository";

export class AdminQueryError extends Error {
  constructor(
    readonly status: 400 | 404,
    readonly error: "Bad Request" | "Not Found",
    message: string,
  ) {
    super(message);
    this.name = "AdminQueryError";
  }
}

export class AdminQueries {
  constructor(
    private readonly repository: AdminQueryRepository,
    private readonly settingsRepository: SystemSettingsRepository,
    private readonly backups: AdminBackupQueryStore,
    private readonly mailer: AdminMailer,
    private readonly config: {
      uploadLimits: Record<string, number>;
      sessionTimeoutMs: number;
      rememberMeTimeoutMs: number;
      smtp: Record<string, unknown>;
    },
  ) {}

  stats() {
    return this.repository.stats();
  }
  settings() {
    return this.settingsRepository.load();
  }
  activity() {
    return this.repository.activity();
  }
  serverConfig() {
    return {
      ...this.config,
      smtp: { ...this.config.smtp, configured: this.mailer.isConfigured() },
    };
  }
  listBackups() {
    return this.backups.list();
  }
  async backup(filename: string) {
    if (!/^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.zip$/.test(filename))
      throw new AdminQueryError(400, "Bad Request", "Invalid backup filename");
    const contents = await this.backups.read(filename);
    if (!contents)
      throw new AdminQueryError(404, "Not Found", "Backup file not found");
    return contents;
  }
}
