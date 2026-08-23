// ============================================
// Admin Routes
//
// All routes require platform ADMIN role.
// ============================================

import { Response, Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { publicUser } from "../application/users/UserQueries";
import logger from "../utils/logger";
import { productionTransportCommands } from "../composition/productionTransportCommands";
import {
  APPROVE_ADMIN_USER,
  ApproveAdminUserCommand,
  CREATE_ADMIN_BACKUP,
  CREATE_ADMIN_USER,
  CreateAdminBackup,
  CreateAdminBackupCommand,
  CreateAdminUser,
  CreateAdminUserCommand,
  INVITE_ADMIN_USER,
  InviteAdminUser,
  InviteAdminUserCommand,
  RESEND_ADMIN_USER_INVITE,
  ResendAdminUserInviteCommand,
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
import { AdminQueryError } from "../application/admin/AdminQueries";
import { productionAdminQueries } from "../composition/productionAdminQueries";
import { productionAdminRestoreUpload } from "../composition/productionAdminRestoreUpload";

const router = Router();

const adminCommands = productionTransportCommands;

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
    return res.json(await productionAdminQueries.stats());
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
    const settings = await productionAdminQueries.settings();
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
      user: publicUser(result.user as any),
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

router.post("/users/invite", async (req, res) => {
  try {
    const result = await productionTransportCommands.dispatch<
      InviteAdminUserCommand,
      Awaited<ReturnType<InviteAdminUser["execute"]>>
    >({ type: INVITE_ADMIN_USER, actor: adminActor(req), input: req.body });
    return res.status(201).json({
      message: `Invitation sent to ${result.user.email}`,
      user: publicUser(result.user as any),
      expiresInDays: result.expiresInDays,
    });
  } catch (error) {
    if (sendAdminCommandError(res, error)) return;
    logger.error("Error inviting user", { err: error });
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to invite user",
    });
  }
});

router.post("/users/:id/resend-invite", async (req, res) => {
  try {
    const result = await productionTransportCommands.dispatch<
      ResendAdminUserInviteCommand,
      { expiresInDays: number }
    >({
      type: RESEND_ADMIN_USER_INVITE,
      actor: adminActor(req),
      userId: req.params.id,
    });
    return res.json({
      message: "Invitation sent",
      expiresInDays: result.expiresInDays,
    });
  } catch (error) {
    if (sendAdminCommandError(res, error)) return;
    logger.error("Error resending invitation", { err: error });
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to resend invitation",
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
    return res.json(await productionAdminQueries.activity());
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
router.get("/config", (_req, res) =>
  res.json(productionAdminQueries.serverConfig()),
);

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
    const backups = await productionAdminQueries.listBackups();
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

  try {
    const contents = await productionAdminQueries.backup(filename);
    res.attachment(filename);
    res.type("application/zip");
    return res.send(contents);
  } catch (error) {
    if (error instanceof AdminQueryError)
      return res
        .status(error.status)
        .json({ error: error.error, message: error.message });
    throw error;
  }
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
  productionAdminRestoreUpload.single("backup"),
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
