// ============================================
// Admin Routes
//
// All routes require platform ADMIN role.
// ============================================

import fs from "fs/promises";
import path from "path";
import multer from "multer";
import { Response, Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { prisma } from "../config/database";
import { getSystemSettings } from "../services/systemSettings";
import { sanitizeUser } from "../services/auth";
import { isSmtpConfigured } from "../services/email";
import { FILE_SIZE_LIMITS } from "../utils/fileUtils";
import logger from "../utils/logger";
import { productionCommandBus } from "../composition/productionApplicationHost";
import {
  APPROVE_ADMIN_USER,
  ApproveAdminUserCommand,
  CREATE_ADMIN_BACKUP,
  CREATE_ADMIN_USER,
  CreateAdminBackup,
  CreateAdminBackupCommand,
  CreateAdminUser,
  CreateAdminUserCommand,
  DELETE_ADMIN_BACKUP,
  DeleteAdminBackupCommand,
  isAdminCommandError,
  RESET_ADMIN_USER_MFA,
  ResetAdminUserMfaCommand,
  RESTORE_ADMIN_BACKUP,
  RestoreAdminBackupCommand,
  SEND_ADMIN_SMTP_TEST,
  SendAdminSmtpTest,
  SendAdminSmtpTestCommand,
  UPDATE_ADMIN_SETTINGS,
  UpdateAdminSettingsCommand,
} from "../application/admin/AdminMutations";

const UPLOADS_DIR = process.env.UPLOAD_DIR || "uploads";
const BACKUP_DIR = path.join(UPLOADS_DIR, "backups");
const BACKUP_FILENAME_RE = /^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.zip$/;

// Guards for restoring an uploaded backup archive (see utils/archive.ts).
// A full-instance backup legitimately bundles every uploaded file, but the
// upload itself is capped at 4 GB by multer and media compresses poorly, so a
// 10 GB decompressed ceiling comfortably fits real backups while stopping a
// zip bomb long before it can exhaust the disk.

// Multer storage for restore uploads — saves the uploaded ZIP to BACKUP_DIR temporarily
const restoreStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdir(BACKUP_DIR, { recursive: true })
      .then(() => cb(null, BACKUP_DIR))
      .catch((err) => cb(err, BACKUP_DIR));
  },
  filename: (_req, _file, cb) => {
    cb(null, `restore-temp-${Date.now()}.zip`);
  },
});
const restoreUpload = multer({
  storage: restoreStorage,
  limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4 GB max
  fileFilter: (_req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith(".zip")) {
      cb(null, true);
    } else {
      cb(new Error("Only .zip backup files are accepted"));
    }
  },
});

const router = Router();

const adminCommands = productionCommandBus;

function adminActor(req: { session: { userId?: string } }) {
  return { userId: req.session.userId! };
}
function sendAdminCommandError(res: Response, error: unknown): boolean {
  if (!isAdminCommandError(error)) return false;
  res.status(error.status).json({ error: error.error, message: error.message });
  return true;
}

// All admin routes require authentication + admin role
router.use(requireAuth, requireAdmin);

// ============================================
// Helpers
// ============================================

// ============================================
// GET /api/admin/stats
// Returns aggregate counts for the dashboard.
// ============================================
router.get("/stats", async (_req, res) => {
  try {
    const [
      userCount,
      campaignCount,
      activeCampaignCount,
      assetStats,
      activeSessionCount,
      sessionCount,
      characterCount,
      mapCount,
      assetBreakdownRaw,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.campaign.count(),
      prisma.campaign.count({ where: { status: "ACTIVE" } }),
      prisma.asset.aggregate({ _sum: { fileSize: true } }),
      prisma.session.count({ where: { endedAt: null } }),
      prisma.session.count(),
      prisma.character.count(),
      prisma.map.count(),
      prisma.asset.groupBy({
        by: ["type"],
        _count: { id: true },
        _sum: { fileSize: true },
      }),
    ]);

    const assetBreakdown = assetBreakdownRaw.map((row) => ({
      type: row.type,
      count: row._count.id,
      sizeBytes: row._sum.fileSize ?? 0,
    }));

    return res.json({
      userCount,
      campaignCount,
      activeCampaignCount,
      totalStorageBytes: assetStats._sum.fileSize ?? 0,
      activeSessionCount,
      sessionCount,
      characterCount,
      mapCount,
      assetBreakdown,
    });
  } catch (error) {
    logger.error("Error fetching admin stats", { err: error });
    return res
      .status(500)
      .json({
        error: "Internal Server Error",
        message: "Failed to fetch stats",
      });
  }
});

// ============================================
// GET /api/admin/settings
// Returns current system settings.
// ============================================
router.get("/settings", async (_req, res) => {
  try {
    const settings = await getSystemSettings();
    return res.json({ settings });
  } catch (error) {
    logger.error("Error fetching system settings", { err: error });
    return res
      .status(500)
      .json({
        error: "Internal Server Error",
        message: "Failed to fetch settings",
      });
  }
});

// ============================================
// PUT /api/admin/settings
// Updates system settings.
// ============================================
router.put("/settings", async (req, res) => {
  try {
    const settings = await adminCommands.dispatch<
      UpdateAdminSettingsCommand,
      Record<string, unknown>
    >({ type: UPDATE_ADMIN_SETTINGS, actor: adminActor(req), input: req.body });

    return res.json({ message: "Settings updated successfully", settings });
  } catch (error) {
    if (sendAdminCommandError(res, error)) return;
    logger.error("Error updating system settings", { err: error });
    return res
      .status(500)
      .json({
        error: "Internal Server Error",
        message: "Failed to update settings",
      });
  }
});

// ============================================
// POST /api/admin/users
// Creates a new user account with a temporary password.
// ============================================
router.post("/users", async (req, res) => {
  try {
    const result = await adminCommands.dispatch<
      CreateAdminUserCommand,
      Awaited<ReturnType<CreateAdminUser["execute"]>>
    >({ type: CREATE_ADMIN_USER, actor: adminActor(req), input: req.body });

    return res.status(201).json({
      message: "User created successfully",
      user: sanitizeUser(result.user as any),
      temporaryPassword: result.temporaryPassword,
    });
  } catch (error) {
    if (sendAdminCommandError(res, error)) return;
    logger.error("Error creating user", { err: error });
    return res
      .status(500)
      .json({
        error: "Internal Server Error",
        message: "Failed to create user",
      });
  }
});

// ============================================
// POST /api/admin/users/:id/approve
// Approves a pending user account.
// ============================================
router.post("/users/:id/approve", async (req, res) => {
  try {
    await adminCommands.dispatch<ApproveAdminUserCommand, void>({
      type: APPROVE_ADMIN_USER,
      actor: adminActor(req),
      userId: req.params.id,
    });

    return res.json({ message: "User account approved." });
  } catch (error) {
    if (sendAdminCommandError(res, error)) return;
    logger.error("Error approving user", { err: error });
    return res
      .status(500)
      .json({
        error: "Internal Server Error",
        message: "Failed to approve user",
      });
  }
});

// ============================================
// POST /api/admin/users/:id/reset-mfa
// Resets MFA for a locked-out user (forces re-enrollment).
// ============================================
router.post("/users/:id/reset-mfa", async (req, res) => {
  try {
    await adminCommands.dispatch<ResetAdminUserMfaCommand, void>({
      type: RESET_ADMIN_USER_MFA,
      actor: adminActor(req),
      userId: req.params.id,
    });

    return res.json({
      message: "MFA has been reset. The user must re-enroll on next login.",
    });
  } catch (error) {
    if (sendAdminCommandError(res, error)) return;
    logger.error("Error resetting MFA", { err: error });
    return res
      .status(500)
      .json({ error: "Internal Server Error", message: "Failed to reset MFA" });
  }
});

// ============================================
// GET /api/admin/activity
// Returns recent user registrations, game sessions, currently-online users,
// and recent admin action logs.
// Note: SystemLog table is written by admin actions. Activity tab now surfaces it.
// Online users are queried from the connect-pg-simple session table.
// ============================================
router.get("/activity", async (_req, res) => {
  try {
    // Query the connect-pg-simple session table for active sessions.
    // Only userId and expiry are extracted — no tokens or sensitive session data.
    const rawSessions = await prisma.$queryRaw<
      { userId: string; expire: Date }[]
    >`
      SELECT sess->>'userId' AS "userId", expire
      FROM session
      WHERE expire > NOW() AND sess->>'userId' IS NOT NULL
    `;

    const onlineUserIds = [...new Set(rawSessions.map((s) => s.userId))];

    const [recentUsers, recentSessions, onlineUsersData, recentLogs] =
      await Promise.all([
        prisma.user.findMany({
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            email: true,
            displayName: true,
            platformRole: true,
            mfaEnabled: true,
            createdAt: true,
            lastLoginAt: true,
          },
        }),
        prisma.session.findMany({
          orderBy: { startedAt: "desc" },
          take: 20,
          include: {
            campaign: {
              select: { id: true, name: true },
            },
          },
        }),
        onlineUserIds.length > 0
          ? prisma.user.findMany({
              where: { id: { in: onlineUserIds } },
              select: {
                id: true,
                email: true,
                displayName: true,
                platformRole: true,
                lastLoginAt: true,
              },
            })
          : Promise.resolve([]),
        prisma.systemLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            level: true,
            message: true,
            userId: true,
            context: true,
            createdAt: true,
          },
        }),
      ]);

    const onlineUsers = onlineUsersData.map((u) => ({
      ...u,
      sessionExpiry: rawSessions.find((s) => s.userId === u.id)?.expire ?? null,
    }));

    return res.json({ recentUsers, recentSessions, onlineUsers, recentLogs });
  } catch (error) {
    logger.error("Error fetching admin activity", { err: error });
    return res
      .status(500)
      .json({
        error: "Internal Server Error",
        message: "Failed to fetch activity",
      });
  }
});

// ============================================
// GET /api/admin/config
// Returns read-only server configuration values
// (upload limits, session timeouts, SMTP status).
// ============================================
router.get("/config", (_req, res) => {
  return res.json({
    uploadLimits: {
      MAP: FILE_SIZE_LIMITS.MAP,
      TOKEN: FILE_SIZE_LIMITS.TOKEN,
      AUDIO: FILE_SIZE_LIMITS.AUDIO,
      AVATAR: FILE_SIZE_LIMITS.AVATAR,
    },
    sessionTimeoutMs: parseInt(process.env.SESSION_MAX_AGE || "3600000"),
    rememberMeTimeoutMs: parseInt(
      process.env.REMEMBER_ME_MAX_AGE || "2592000000",
    ),
    smtp: {
      configured: isSmtpConfigured(),
      host: process.env.SMTP_HOST || null,
      port: parseInt(process.env.SMTP_PORT || "587"),
      user: process.env.SMTP_USER || null,
      secure: process.env.SMTP_SECURE === "true",
    },
  });
});

// ============================================
// POST /api/admin/smtp/test
// Sends a test email to the calling admin to verify SMTP.
// ============================================
router.post("/smtp/test", async (req, res) => {
  try {
    const result = await adminCommands.dispatch<
      SendAdminSmtpTestCommand,
      Awaited<ReturnType<SendAdminSmtpTest["execute"]>>
    >({ type: SEND_ADMIN_SMTP_TEST, actor: adminActor(req) });
    return res.json({ message: `Test email sent to ${result.email}` });
  } catch (error) {
    if (sendAdminCommandError(res, error)) return;
    logger.error("SMTP test error", { err: error });
    return res
      .status(500)
      .json({ error: "SMTP Error", message: "Failed to send test email" });
  }
});

// ============================================
// POST /api/admin/backups
// Creates a full instance backup: pg_dump of the database + all uploaded
// files bundled into a single downloadable ZIP archive.
// Requires pg_dump (postgresql-client) to be installed in the container.
// ============================================
router.post("/backups", async (req, res) => {
  try {
    const backup = await adminCommands.dispatch<
      CreateAdminBackupCommand,
      Awaited<ReturnType<CreateAdminBackup["execute"]>>
    >({ type: CREATE_ADMIN_BACKUP, actor: adminActor(req) });
    return res.status(201).json(backup);
  } catch (error) {
    if (sendAdminCommandError(res, error)) return;
    logger.error("Backup error", { err: error });
    return res
      .status(500)
      .json({
        error: "Internal Server Error",
        message: "Failed to create backup",
      });
  }
});

// ============================================
// GET /api/admin/backups
// Lists all available instance backups.
// ============================================
router.get("/backups", async (_req, res) => {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const files = await fs.readdir(BACKUP_DIR);
    const backups = await Promise.all(
      files
        .filter((f) => BACKUP_FILENAME_RE.test(f))
        .map(async (f) => {
          const stat = await fs.stat(path.join(BACKUP_DIR, f));
          return {
            filename: f,
            sizeBytes: stat.size,
            createdAt: stat.mtime.toISOString(),
          };
        }),
    );
    backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return res.json({ backups });
  } catch {
    return res.json({ backups: [] });
  }
});

// ============================================
// GET /api/admin/backups/:filename/download
// Downloads a backup ZIP file.
// ============================================
router.get("/backups/:filename/download", async (req, res) => {
  const { filename } = req.params;

  if (!BACKUP_FILENAME_RE.test(filename)) {
    return res
      .status(400)
      .json({ error: "Bad Request", message: "Invalid backup filename" });
  }

  const filepath = path.join(BACKUP_DIR, filename);
  try {
    await fs.access(filepath);
  } catch {
    return res
      .status(404)
      .json({ error: "Not Found", message: "Backup file not found" });
  }

  return res.download(filepath, filename);
});

// ============================================
// DELETE /api/admin/backups/:filename
// Deletes a backup file.
// ============================================
router.delete("/backups/:filename", async (req, res) => {
  try {
    await adminCommands.dispatch<DeleteAdminBackupCommand, void>({
      type: DELETE_ADMIN_BACKUP,
      actor: adminActor(req),
      filename: req.params.filename,
    });
    return res.json({ message: "Backup deleted" });
  } catch (error) {
    if (sendAdminCommandError(res, error)) return;
    logger.error("Backup delete error", { err: error });
    return res
      .status(500)
      .json({
        error: "Internal Server Error",
        message: "Failed to delete backup",
      });
  }
});

// ============================================
// POST /api/admin/backups/restore
// Restores the entire instance from an uploaded backup ZIP.
// The ZIP must contain database.sql (created by pg_dump --clean --if-exists)
// and optionally an uploads/ directory.
// WARNING: This overwrites the current database and all uploaded files.
// ============================================
router.post(
  "/backups/restore",
  restoreUpload.single("backup"),
  async (req, res) => {
    if (!req.file) {
      return res
        .status(400)
        .json({ error: "Bad Request", message: "No backup file provided" });
    }
    try {
      await adminCommands.dispatch<RestoreAdminBackupCommand, void>({
        type: RESTORE_ADMIN_BACKUP,
        actor: adminActor(req),
        uploadedZip: req.file.path,
      });

      return res.json({
        message:
          "Restore complete. Your session is no longer valid — please refresh and log in again.",
      });
    } catch (error) {
      if (sendAdminCommandError(res, error)) return;
      logger.error("Restore error", { err: error });
      return res
        .status(500)
        .json({
          error: "Restore Failed",
          message: "An unexpected error occurred during restore",
        });
    }
  },
);

export default router;
