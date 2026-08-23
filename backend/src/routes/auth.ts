/// <reference path="../types/express.d.ts" />
import { Router, Request, Response } from "express";
import { publicUser } from "../application/users/UserQueries";
import { rememberMeMaxAge } from "../config/session";
import { requireAuth } from "../middleware/auth";
import { productionUserQueries } from "../composition/productionUserQueries";
import { productionPublicSettingsQueries } from "../composition/productionPublicSettingsQueries";
import rateLimit from "express-rate-limit";
import logger from "../utils/logger";
import { productionTransportCommands } from "../composition/productionTransportCommands";
import {
  LOGIN_ACCOUNT,
  LoginAccountCommand,
  REGISTER_ACCOUNT,
  RegisterAccountCommand,
} from "../application/identity/AuthenticationCommands";
import { IdentityError, IdentityUser } from "../domain/identity/Identity";
import {
  FORGOT_PASSWORD,
  RESET_PASSWORD,
  CHANGE_PASSWORD,
  DELETE_ACCOUNT,
  MFA_SETUP,
  MFA_VERIFY,
  MFA_VERIFY_LOGIN,
  MFA_DISABLE,
  MFA_BACKUP_CODES,
} from "../application/identity/AuthSecurityCommands";

// ============================================
// MFA Helpers
// ============================================

const router = Router();
const identityCommands = productionTransportCommands;
const authSecurityCommands = productionTransportCommands;

/**
 * Rate limiting for authentication endpoints
 * 5 attempts per 15 minutes
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || "5", 10),
  message: "Too many authentication attempts, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

const mfaSetupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error: "Rate Limited",
    message: "Too many MFA verification attempts, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/auth/register
 * Register a new user account
 * First user automatically becomes ADMIN
 */
router.post("/register", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = req.body;
    const result = await identityCommands.dispatch<
      RegisterAccountCommand,
      { user: IdentityUser; pendingApproval: boolean }
    >({
      type: REGISTER_ACCOUNT,
      input: { email, password, displayName },
    });
    if (result.pendingApproval) {
      return res.status(201).json({
        message:
          "Registration submitted. Your account is pending admin approval.",
        pendingApproval: true,
      });
    }
    const user = result.user;
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.displayName = user.displayName;
    req.session.platformRole = user.platformRole;
    req.session.mustChangePassword = user.mustChangePassword;
    return res
      .status(201)
      .json({
        message: "User registered successfully",
        user: publicUser(user as any),
      });
  } catch (error) {
    if (error instanceof IdentityError)
      return res
        .status(error.status)
        .json({ error: error.error, message: error.message });
    if (error instanceof Error) {
      return res.status(400).json({
        error: "Registration Failed",
        message: error.message,
      });
    } else {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred",
      });
    }
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and create session
 */
router.post("/login", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, rememberMe } = req.body;
    const user = await identityCommands.dispatch<
      LoginAccountCommand,
      IdentityUser
    >({
      type: LOGIN_ACCOUNT,
      input: { email, password, rememberMe },
    });
    if (user.mfaEnabled) {
      req.session.mfaPending = true;
      req.session.mfaPendingUserId = user.id;
      req.session.mfaRememberMe = !!rememberMe;
      return res
        .status(200)
        .json({
          mfaRequired: true,
          message: "MFA verification required. Please enter your TOTP code.",
        });
    }
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.displayName = user.displayName;
    req.session.platformRole = user.platformRole;
    if (rememberMe && req.session.cookie)
      req.session.cookie.maxAge = rememberMeMaxAge;
    return res
      .status(200)
      .json({
        message: "Login successful",
        user: publicUser(user as any),
        mustChangePassword: user.mustChangePassword,
      });
  } catch (error) {
    if (error instanceof IdentityError)
      return res
        .status(error.status)
        .json({ error: error.error, message: error.message });
    if (error instanceof Error) {
      return res.status(400).json({
        error: "Login Failed",
        message: error.message,
      });
    } else {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred",
      });
    }
  }
});

/**
 * POST /api/auth/logout
 * Destroy session and log out user
 */
router.post("/logout", (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        error: "Logout Failed",
        message: "Failed to destroy session",
      });
    }

    res.clearCookie("cozyvtt.sid");
    return res.status(200).json({
      message: "Logout successful",
    });
  });
});

/**
 * GET /api/auth/me
 * Get current authenticated user (fetches from DB to include avatarUrl and other profile fields)
 */
router.get("/me", async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Not authenticated",
    });
  }

  try {
    const user = await productionUserQueries.current(req.session.userId);

    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({
        error: "Unauthorized",
        message: "User not found",
      });
    }

    return res.status(200).json({
      user,
    });
  } catch (error) {
    logger.error("Error in GET /me", { err: error });
    return res.status(500).json({
      error: "Internal Server Error",
      message: "An unexpected error occurred",
    });
  }
});

/**
 * POST /api/auth/forgot-password
 * Request a password reset email
 * Always returns 200 to prevent email enumeration
 */

/**
 * POST /api/auth/reset-password
 * Reset password using a valid token
 */

/**
 * POST /api/auth/change-password
 * Change password for authenticated user
 */

/**
 * DELETE /api/auth/account
 * Self-service account deletion. Requires password approval.
 */

// ============================================
// MFA Endpoints
// Multi-Factor Authentication
// ============================================

/**
 * POST /api/auth/mfa/setup
 * Generate TOTP secret and QR code for authenticated user.
 * Stores the secret in DB (not yet enabled until verified).
 * Requires: Authentication
 */

/**
 * POST /api/auth/mfa/verify
 * Verify TOTP token to complete MFA setup. Generates and returns backup codes (shown once).
 * Requires: Authentication + mfaSecret stored on user
 */

/**
 * POST /api/auth/mfa/verify-login
 * Verify TOTP or backup code during login MFA flow.
 * Requires: mfaPending session state (set by /login when user has MFA enabled)
 */

/**
 * POST /api/auth/mfa/disable
 * Disable MFA. Requires current password and valid TOTP token.
 * Admins cannot disable MFA
 * Requires: Authentication
 */

/**
 * POST /api/auth/mfa/backup-codes
 * Regenerate backup codes. Requires current password.
 * Requires: Authentication + MFA enabled
 */

function securityError(res: Response, error: unknown): boolean {
  if (!(error instanceof IdentityError)) return false;
  res.status(error.status).json({ error: error.error, message: error.message });
  return true;
}
router.post("/forgot-password", authLimiter, async (req, res) => {
  try {
    const x = await authSecurityCommands.dispatch<any, { smtp: boolean }>({
      type: FORGOT_PASSWORD,
      email: req.body.email,
    });
    return res
      .status(200)
      .json({
        message: x.smtp
          ? "If an account with that email exists, a password reset link has been sent."
          : "Password reset is not available. Contact your administrator.",
      });
  } catch (e) {
    if (securityError(res, e)) return;
    logger.error("Error in forgot-password", { err: e });
    return res
      .status(500)
      .json({
        error: "Internal Server Error",
        message: "An unexpected error occurred",
      });
  }
});
router.post("/reset-password", authLimiter, async (req, res) => {
  try {
    await authSecurityCommands.dispatch<any, void>({
      type: RESET_PASSWORD,
      token: req.body.token,
      newPassword: req.body.newPassword,
    });
    return res
      .status(200)
      .json({ message: "Password has been reset successfully" });
  } catch (e) {
    if (securityError(res, e)) return;
    logger.error("Error in reset-password", { err: e });
    return res
      .status(500)
      .json({
        error: "Internal Server Error",
        message: "An unexpected error occurred",
      });
  }
});
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    await authSecurityCommands.dispatch<any, void>({
      type: CHANGE_PASSWORD,
      userId: req.session.userId,
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword,
    });
    req.session.mustChangePassword = false;
    return res.status(200).json({ message: "Password changed successfully" });
  } catch (e) {
    if (securityError(res, e)) return;
    logger.error("Error in change-password", { err: e });
    return res
      .status(500)
      .json({
        error: "Internal Server Error",
        message: "An unexpected error occurred",
      });
  }
});
router.delete("/account", requireAuth, async (req, res) => {
  try {
    await authSecurityCommands.dispatch<any, void>({
      type: DELETE_ACCOUNT,
      userId: req.session.userId,
      password: req.body.password,
    });
    req.session.destroy(() => {});
    res.clearCookie("cozyvtt.sid");
    return res.status(200).json({ message: "Account deleted successfully" });
  } catch (e) {
    if (securityError(res, e)) return;
    logger.error("Error deleting account", { err: e });
    return res
      .status(500)
      .json({
        error: "Internal Server Error",
        message: "Failed to delete account",
      });
  }
});
router.post("/mfa/setup", requireAuth, async (req, res) => {
  try {
    const x = await authSecurityCommands.dispatch<any, { qrCodeUrl: string }>({
      type: MFA_SETUP,
      userId: req.session.userId,
    });
    return res
      .status(200)
      .json({
        message: "MFA setup initiated. Scan the QR code and verify to enable.",
        qrCodeUrl: x.qrCodeUrl,
      });
  } catch (e) {
    if (securityError(res, e)) return;
    return res
      .status(500)
      .json({ error: "Internal Server Error", message: "Failed to setup MFA" });
  }
});
router.post("/mfa/verify", requireAuth, mfaSetupLimiter, async (req, res) => {
  try {
    const x = await authSecurityCommands.dispatch<any, string[]>({
      type: MFA_VERIFY,
      userId: req.session.userId,
      token: req.body.token,
    });
    return res
      .status(200)
      .json({
        message:
          "MFA enabled successfully. Save these backup codes securely — they will not be shown again.",
        backupCodes: x,
      });
  } catch (e) {
    if (securityError(res, e)) return;
    return res
      .status(500)
      .json({
        error: "Internal Server Error",
        message: "Failed to verify MFA token",
      });
  }
});
router.post("/mfa/verify-login", authLimiter, async (req, res) => {
  try {
    if (!req.session.mfaPending || !req.session.mfaPendingUserId)
      return res
        .status(401)
        .json({
          error: "Unauthorized",
          message: "No MFA verification pending. Please log in first.",
        });
    const x = await authSecurityCommands.dispatch<any, any>({
      type: MFA_VERIFY_LOGIN,
      userId: req.session.mfaPendingUserId,
      token: req.body.token,
      backupCode: req.body.backupCode,
    });
    const remember = req.session.mfaRememberMe;
    const u = x.user;
    req.session.userId = u.id;
    req.session.email = u.email;
    req.session.displayName = u.displayName;
    req.session.platformRole = u.platformRole;
    req.session.mustChangePassword = u.mustChangePassword;
    req.session.mfaPending = undefined;
    req.session.mfaPendingUserId = undefined;
    req.session.mfaRememberMe = undefined;
    if (remember && req.session.cookie)
      req.session.cookie.maxAge = rememberMeMaxAge;
    const body: any = {
      message: "Login successful",
      user: publicUser(u as any),
      mustChangePassword: u.mustChangePassword,
    };
    if (x.backupCodeUsed) {
      body.backupCodeUsed = true;
      body.remainingBackupCodes = x.remainingBackupCodes;
      if (x.remainingBackupCodes <= 3)
        body.warning = `You have ${x.remainingBackupCodes} backup code${x.remainingBackupCodes !== 1 ? "s" : ""} remaining. Regenerate them in your profile settings.`;
    }
    return res.status(200).json(body);
  } catch (e) {
    if (securityError(res, e)) return;
    return res
      .status(500)
      .json({
        error: "Internal Server Error",
        message: "Failed to verify MFA",
      });
  }
});
router.post("/mfa/disable", requireAuth, async (req, res) => {
  try {
    await authSecurityCommands.dispatch<any, void>({
      type: MFA_DISABLE,
      userId: req.session.userId,
      password: req.body.password,
      token: req.body.token,
    });
    return res.status(200).json({ message: "MFA disabled successfully" });
  } catch (e) {
    if (securityError(res, e)) return;
    return res
      .status(500)
      .json({
        error: "Internal Server Error",
        message: "Failed to disable MFA",
      });
  }
});
router.post("/mfa/backup-codes", requireAuth, async (req, res) => {
  try {
    const x = await authSecurityCommands.dispatch<any, string[]>({
      type: MFA_BACKUP_CODES,
      userId: req.session.userId,
      password: req.body.password,
    });
    return res
      .status(200)
      .json({
        message:
          "Backup codes regenerated. Save these securely — they will not be shown again.",
        backupCodes: x,
      });
  } catch (e) {
    if (securityError(res, e)) return;
    return res
      .status(500)
      .json({
        error: "Internal Server Error",
        message: "Failed to regenerate backup codes",
      });
  }
});

/**
 * GET /api/auth/registration-status
 * Returns whether public self-registration is currently enabled.
 * Used by the frontend to show/hide the register link on the login page.
 * No authentication required — this is intentionally public information.
 */
router.get("/registration-status", async (_req: Request, res: Response) => {
  try {
    return res
      .status(200)
      .json(await productionPublicSettingsQueries.registrationStatus());
  } catch (error) {
    // Safe fallback: hide registration link on error
    return res.status(200).json({ allowRegistration: false });
  }
});

/**
 * GET /api/auth/appearance
 * Returns the instance's appearance settings (theme, font, branding).
 * No authentication required — the login page needs to render with the correct theme.
 */
router.get("/appearance", async (_req: Request, res: Response) => {
  try {
    const appearance = await productionPublicSettingsQueries.appearance();
    return res.status(200).json(appearance);
  } catch (error) {
    return res.status(200).json({
      themeId: "cozy-default",
      customThemeColors: null,
      fontId: "default",
      customLogoUrl: null,
      customFaviconUrl: null,
      customMascotUrl: null,
    });
  }
});

/**
 * GET /api/auth/ping
 * Session keepalive — extends the rolling session cookie without fetching user data.
 * Called periodically by the frontend during active gameplay to prevent mid-session expiry.
 */
router.get("/ping", requireAuth, (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

export default router;
