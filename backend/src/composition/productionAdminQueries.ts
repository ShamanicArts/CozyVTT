import { FileSystemAdminBackupStore } from "../adapters/admin/FileSystemAdminBackupStore";
import { ServiceAdminMailer } from "../adapters/admin/ServiceAdminMailer";
import { PrismaAdminQueryRepository } from "../adapters/persistence/PrismaAdminQueryRepository";
import { AdminQueries } from "../application/admin/AdminQueries";
import { FILE_SIZE_LIMITS } from "../utils/fileUtils";
import { prisma } from "../config/database";
import { productionSystemSettings } from "./productionPublicSettingsQueries";

const uploadsDir = process.env.UPLOAD_DIR || "uploads";
export const productionAdminBackups = new FileSystemAdminBackupStore(
  uploadsDir,
  `${uploadsDir}/backups`,
  process.env.DATABASE_URL,
  100_000,
  10 * 1024 * 1024 * 1024,
);
export const productionAdminQueries = new AdminQueries(
  new PrismaAdminQueryRepository(prisma),
  productionSystemSettings,
  productionAdminBackups,
  new ServiceAdminMailer(),
  {
    uploadLimits: FILE_SIZE_LIMITS,
    sessionTimeoutMs: parseInt(process.env.SESSION_MAX_AGE || "3600000"),
    rememberMeTimeoutMs: parseInt(
      process.env.REMEMBER_ME_MAX_AGE || "2592000000",
    ),
    smtp: {
      host: process.env.SMTP_HOST || null,
      port: parseInt(process.env.SMTP_PORT || "587"),
      user: process.env.SMTP_USER || null,
      secure: process.env.SMTP_SECURE === "true",
    },
  },
);
