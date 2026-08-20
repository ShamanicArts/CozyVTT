import { Router, Request, Response } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { prisma } from "../config/database";
import { sanitizeUser } from "../services/auth";
import type { UserPreferences } from "../validators/userPreferences";
import logger from "../utils/logger";
import { productionCommandBus } from "../composition/productionApplicationHost";
import {
  DELETE_USER_AS_ADMIN,
  DeleteUserAsAdminCommand,
  RESET_USER_PASSWORD_AS_ADMIN,
  ResetUserPasswordAsAdminCommand,
  SEND_USER_PASSWORD_RESET_LINK,
  SendUserPasswordResetLinkCommand,
  UPDATE_USER_PREFERENCES,
  UpdateUserPreferencesCommand,
  UPDATE_USER_PROFILE,
  UpdateUserProfileCommand,
} from "../application/users/UserMutations";
import { UserMutationError } from "../domain/users/UserMutations";

/**
 * User Management Routes
 * User Management Endpoints
 */

const router = Router();
const userMutationCommands = productionCommandBus;

function sendUserMutationError(res: Response, error: unknown): boolean {
  if (!(error instanceof UserMutationError)) return false;
  res
    .status(error.status)
    .json({
      error: error.error,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  return true;
}

/**
 * GET /api/users
 * List all users (Admin only)
 * Requires: Admin role
 */
router.get(
  "/",
  requireAuth,
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
      });

      // Sanitize all users before returning
      const sanitizedUsers = users.map((user) => sanitizeUser(user));

      return res.status(200).json({ users: sanitizedUsers });
    } catch (error) {
      logger.error("Error fetching users", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch users",
      });
    }
  },
);

/**
 * GET /api/users/:id
 * Get specific user
 * Requires: Authentication (users can view their own profile, admins can view any)
 */
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requestingUserId = req.session.userId;
    const isAdmin = req.session.platformRole === "ADMIN";

    // Check authorization: user can only view their own profile unless admin
    if (id !== requestingUserId && !isAdmin) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to view this user",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return res.status(404).json({
        error: "Not Found",
        message: "User not found",
      });
    }

    return res.status(200).json({ user: sanitizeUser(user) });
  } catch (error) {
    logger.error("Error fetching user", { err: error });
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch user",
    });
  }
});

/**
 * PUT /api/users/:id
 * Update user profile
 * Requires: Authentication (users can update their own profile, admins can update any)
 * Allowed fields: displayName, email, avatarUrl
 * Admins can also update: platformRole
 */
router.put("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requestingUserId = req.session.userId;
    const isAdmin = req.session.platformRole === "ADMIN";
    const user = await userMutationCommands.dispatch<
      UpdateUserProfileCommand,
      unknown
    >({
      type: UPDATE_USER_PROFILE,
      actorId: requestingUserId!,
      isAdmin,
      userId: id,
      input: req.body,
    });
    return res
      .status(200)
      .json({
        message: "User updated successfully",
        user: sanitizeUser(user as any),
      });
  } catch (error) {
    if (sendUserMutationError(res, error)) return;
    logger.error("Error updating user", { err: error });
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to update user",
    });
  }
});

/**
 * GET /api/users/:id/preferences
 * Returns the user's stored preferences blob (theme/font/dice color/etc.).
 * Returns an empty object if the user has not set any preferences yet —
 * frontend layers on top of system defaults.
 *
 * Auth: user can fetch own preferences; admins can fetch anyone's.
 */
router.get(
  "/:id/preferences",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const requestingUserId = req.session.userId;
      const isAdmin = req.session.platformRole === "ADMIN";
      if (id !== requestingUserId && !isAdmin) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to view this user's preferences",
        });
      }

      const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, preferences: true },
      });

      if (!user) {
        return res.status(404).json({
          error: "Not Found",
          message: "User not found",
        });
      }

      const preferences = (user.preferences as UserPreferences | null) ?? {};
      return res.status(200).json({ preferences });
    } catch (error) {
      logger.error("Error fetching user preferences", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch user preferences",
      });
    }
  },
);

/**
 * PUT /api/users/:id/preferences
 * Partial-merge update — accepts any subset of UserPreferences fields and
 * merges them into the existing preferences JSON. Returns the merged blob.
 *
 * Auth: user can update own preferences; admins can update anyone's
 * (matches existing PUT /:id pattern).
 */
router.put(
  "/:id/preferences",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const requestingUserId = req.session.userId;
      const isAdmin = req.session.platformRole === "ADMIN";

      const updated = await userMutationCommands.dispatch<
        UpdateUserPreferencesCommand,
        any
      >({
        type: UPDATE_USER_PREFERENCES,
        actorId: requestingUserId!,
        isAdmin,
        userId: id,
        input: req.body,
      });
      return res.status(200).json({
        message: "Preferences updated successfully",
        preferences: (updated.preferences as UserPreferences | null) ?? {},
      });
    } catch (error) {
      if (sendUserMutationError(res, error)) return;
      logger.error("Error updating user preferences", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update user preferences",
      });
    }
  },
);

/**
 * DELETE /api/users/:id
 * Delete user (Admin only)
 * Requires: Admin role
 * Note: This will cascade delete all related data (campaigns, memberships, etc.)
 */
router.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const requestingUserId = req.session.userId;
      const deletedUserAssetCount = await userMutationCommands.dispatch<
        DeleteUserAsAdminCommand,
        number
      >({
        type: DELETE_USER_AS_ADMIN,
        actorId: requestingUserId!,
        userId: id,
      });
      return res
        .status(200)
        .json({ message: "User deleted successfully", deletedUserAssetCount });
    } catch (error) {
      if (sendUserMutationError(res, error)) return;
      logger.error("Error deleting user", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to delete user",
      });
    }
  },
);

/**
 * POST /api/users/:id/reset-password
 * Admin can generate a temporary password for a user
 * Requires: Admin role
 * Returns: Temporary password (one-time display)
 */
router.post(
  "/:id/reset-password",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const temporaryPassword = await userMutationCommands.dispatch<
        ResetUserPasswordAsAdminCommand,
        string
      >({
        type: RESET_USER_PASSWORD_AS_ADMIN,
        userId: id,
      });
      return res.status(200).json({
        message: "Password reset successfully",
        temporaryPassword,
        mustChangePassword: true,
        notice:
          "This temporary password will only be displayed once. The user will be required to change it on next login.",
      });
    } catch (error) {
      if (sendUserMutationError(res, error)) return;
      logger.error("Error resetting password", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to reset password",
      });
    }
  },
);

/**
 * POST /api/users/:id/send-reset-link
 * Admin sends a password reset email link to a user.
 * Creates a PasswordResetToken and emails the link — SMTP must be configured.
 * Requires: Admin role
 */
router.post(
  "/:id/send-reset-link",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const email = await userMutationCommands.dispatch<
        SendUserPasswordResetLinkCommand,
        string
      >({
        type: SEND_USER_PASSWORD_RESET_LINK,
        userId: id,
      });
      return res
        .status(200)
        .json({ message: `Password reset link sent to ${email}.` });
    } catch (error) {
      if (sendUserMutationError(res, error)) return;
      logger.error("Error sending password reset link", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to send password reset link",
      });
    }
  },
);

export default router;
