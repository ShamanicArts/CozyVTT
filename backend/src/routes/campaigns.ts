import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { AuthenticatedRequest } from "../middleware/rbac";
import {
  authenticated,
  campaignMember,
  campaignDM,
  adminOnly,
} from "../middleware/compose";
import { CampaignHttpQueryError } from "../application/campaigns/CampaignHttpQueries";
import { productionCampaignHttpQueries } from "../composition/productionQueryHost";
import { CreateCampaignSchema } from "../validators/campaigns";
import logger from "../utils/logger";
import { asError } from "../utils/errors";
import { productionTransportCommands } from "../composition/productionTransportCommands";
import {
  CHANGE_CAMPAIGN_MEMBER_ROLE,
  CREATE_CAMPAIGN,
  DELETE_CAMPAIGN,
  INVITE_TO_CAMPAIGN,
  REMOVE_CAMPAIGN_MEMBER,
  UPDATE_CAMPAIGN,
  UPDATE_CAMPAIGN_VIBE,
  SET_CAMPAIGN_PRESENTATION,
  ChangeCampaignMemberRole,
  ChangeCampaignMemberRoleCommand,
  CreateCampaign,
  CreateCampaignCommand,
  DeleteCampaignCommand,
  InviteToCampaign,
  InviteToCampaignCommand,
  RemoveCampaignMemberCommand,
  UpdateCampaign,
  UpdateCampaignCommand,
  UpdateCampaignVibe,
  UpdateCampaignVibeCommand,
  SetCampaignPresentationCommand,
  isCampaignCommandError,
} from "../application/campaigns/CampaignCommands";
import { productionExtensionOperations } from "../composition/productionExtensionOperations";
import { broadcastToCampaign } from "../websocket/socketInstance";
import {
  EXPORT_CAMPAIGN_ARCHIVE,
  ExportCampaignArchiveCommand,
  IMPORT_CAMPAIGN_ARCHIVE,
  ImportCampaignArchiveCommand,
  PREVIEW_CAMPAIGN_ARCHIVE_IMPORT,
  PreviewCampaignArchiveImportCommand,
} from "../application/campaignArchives/CampaignArchiveCommands";
import {
  CampaignArchiveError,
  CampaignArchiveExport,
  CampaignArchiveImportResult,
  CampaignArchivePreview,
} from "../domain/campaignArchives/CampaignArchive";
import {
  END_CAMPAIGN_SESSION,
  PAUSE_CAMPAIGN_SESSION,
  RESUME_CAMPAIGN_SESSION,
  START_CAMPAIGN_SESSION,
  EndCampaignSession,
  EndCampaignSessionCommand,
  PauseCampaignSession,
  PauseCampaignSessionCommand,
  ResumeCampaignSession,
  ResumeCampaignSessionCommand,
  StartCampaignSession,
  StartCampaignSessionCommand,
  isSessionLifecycleError,
} from "../application/campaigns/SessionLifecycleCommands";

const router = Router();

const campaignCommands = productionTransportCommands;

const campaignArchiveCommands = productionTransportCommands;

const campaignSessionCommands = productionTransportCommands;

function sendCampaignCommandError(res: Response, error: unknown): boolean {
  if (!isCampaignCommandError(error)) return false;
  res
    .status(error.status)
    .json(
      error.error
        ? { error: error.error, message: error.message }
        : { message: error.message },
    );
  return true;
}

function sendSessionLifecycleError(res: Response, error: unknown): boolean {
  if (!isSessionLifecycleError(error)) return false;
  res.status(error.status).json({ error: error.error, message: error.message });
  return true;
}

// ── Import file upload (memory storage — ZIP stays in buffer) ───────────────
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 524288000, files: 1 }, // 500 MB hard cap
  fileFilter: (_req, file, cb) => {
    // Accept .cozyvtt or .zip MIME types
    const allowed = [
      "application/zip",
      "application/x-zip-compressed",
      "application/octet-stream",
    ];
    if (
      allowed.includes(file.mimetype) ||
      file.originalname.endsWith(".cozyvtt")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only .cozyvtt archives are accepted."));
    }
  },
});

/**
 * Campaign Routes
 * Campaign Endpoints
 */

/**
 * GET /api/campaigns
 * Get all campaigns the user is a member of
 * Requires: Authentication
 */
router.get(
  "/",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.session.userId!;

      // Find all campaigns where user is a member.
      // SECURITY: Do NOT include `email` in any nested user select — these
      // payloads are returned to non-admin users who can see their fellow
      // members. Emails are PII and only the owner of an account (via
      // /auth/me) or platform admins should ever receive them. Same rule
      // applies to every other endpoint in this file that embeds users.
      const campaigns = await productionCampaignHttpQueries.forUser(userId);

      return res.status(200).json({ campaigns });
    } catch (error) {
      logger.error("Error fetching campaigns", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch campaigns",
      });
    }
  },
);

/** Persist the campaign-wide stage renderer without changing the current map. */
router.put(
  "/:campaignId/presentation",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const activePresentationId =
        typeof req.body?.activePresentationId === "string"
          ? req.body.activePresentationId.trim()
          : "";
      const corePresentationId = "cozyvtt.core.map-2d";
      if (activePresentationId !== corePresentationId) {
        const { presentations } =
          await productionExtensionOperations.campaignContributions(
            req.params.campaignId,
            "DM",
          );
        const available = presentations.some(
          ({ extensionId, presentation }) =>
            `${extensionId}.${presentation.id}` === activePresentationId,
        );
        if (!available) {
          return res.status(400).json({
            error: "Validation Error",
            message: "Campaign presentation is not available",
          });
        }
      }

      const result = await campaignCommands.dispatch<
        SetCampaignPresentationCommand,
        { activePresentationId: string }
      >({
        type: SET_CAMPAIGN_PRESENTATION,
        campaignId: req.params.campaignId,
        activePresentationId,
      });
      broadcastToCampaign(
        req.params.campaignId,
        "campaign.presentation.changed",
        result,
      );
      return res.json(result);
    } catch (error) {
      if (sendCampaignCommandError(res, error)) return;
      logger.error("Error selecting campaign presentation", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to select campaign presentation",
      });
    }
  },
);

/**
 * POST /api/campaigns
 * Create a new campaign
 * Requires: Authentication
 * Note: Creator automatically becomes campaign owner and DM
 */
router.post(
  "/",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.session.userId!;

      const parsed = CreateCampaignSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation Error",
          message: parsed.error.issues[0]?.message ?? "Invalid campaign data",
        });
      }
      const { name, description, gameSystem } = parsed.data;
      const result = await campaignCommands.dispatch<
        CreateCampaignCommand,
        Awaited<ReturnType<CreateCampaign["execute"]>>
      >({
        type: CREATE_CAMPAIGN,
        ownerId: userId,
        name,
        description,
        gameSystem,
      });

      return res.status(201).json({
        message: "Campaign created successfully",
        campaign: result.campaign,
      });
    } catch (error) {
      logger.error("Error creating campaign", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to create campaign",
      });
    }
  },
);

/**
 * GET /api/campaigns/:campaignId
 * Get campaign details
 * Requires: Campaign membership (any role)
 */
router.get(
  "/:campaignId",
  campaignMember,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId } = req.params;

      const campaign = await productionCampaignHttpQueries.details(
        campaignId,
        req.campaignMembership!.role,
      );
      return res.status(200).json({
        campaign,
      });
    } catch (error) {
      if (error instanceof CampaignHttpQueryError)
        return res
          .status(error.status)
          .json({ error: error.error, message: error.message });
      logger.error("Error fetching campaign", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch campaign",
      });
    }
  },
);

/**
 * GET /api/campaigns/:campaignId/characters
 * Get all characters in campaign grouped by member.
 * Includes extracted HP info per character (game-system-aware).
 * Requires: Campaign membership (any role)
 */

router.get(
  "/:campaignId/characters",
  campaignMember,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId } = req.params;

      const roster =
        await productionCampaignHttpQueries.characterRoster(campaignId);

      return res.status(200).json({ roster });
    } catch (error) {
      logger.error("Error fetching campaign characters", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch campaign characters",
      });
    }
  },
);

/**
 * PUT /api/campaigns/:campaignId
 * Update campaign settings
 * Requires: Campaign DM role
 */
router.put(
  "/:campaignId",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId } = req.params;
      const result = await campaignCommands.dispatch<
        UpdateCampaignCommand,
        Awaited<ReturnType<UpdateCampaign["execute"]>>
      >({ type: UPDATE_CAMPAIGN, campaignId, input: req.body });
      if (result.gameSystemCharacterCount) {
        logger.warn("campaign game system changed with existing characters", {
          campaignId,
          characterCount: result.gameSystemCharacterCount,
        });
      }

      return res.status(200).json({
        message: "Campaign updated successfully",
        campaign: result.campaign,
      });
    } catch (error) {
      if (sendCampaignCommandError(res, error)) return;
      logger.error("Error updating campaign", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update campaign",
      });
    }
  },
);

/**
 * PUT /api/campaigns/:campaignId/vibe
 * Update vibe tracker settings for a campaign
 * Requires: Campaign DM role
 * Vibe Tracker Details
 */
router.put(
  "/:campaignId/vibe",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId } = req.params;
      const result = await campaignCommands.dispatch<
        UpdateCampaignVibeCommand,
        Awaited<ReturnType<UpdateCampaignVibe["execute"]>>
      >({
        type: UPDATE_CAMPAIGN_VIBE,
        campaignId,
        vibeSettings: req.body.vibeSettings,
      });

      return res.status(200).json({
        message: "Vibe settings updated successfully",
        vibeSettings: result.vibeSettings,
        currentVibe: result.currentVibe,
      });
    } catch (error) {
      if (sendCampaignCommandError(res, error)) return;
      logger.error("Error updating vibe settings", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update vibe settings",
      });
    }
  },
);

/**
 * DELETE /api/campaigns/:campaignId
 * Delete a campaign
 * Requires: Campaign owner or Admin
 */
router.delete(
  "/:campaignId",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.session.userId!;
      const platformRole = req.session.platformRole!;
      const { campaignId } = req.params;

      await campaignCommands.dispatch<DeleteCampaignCommand, void>({
        type: DELETE_CAMPAIGN,
        campaignId,
        requesterId: userId,
        platformRole,
      });

      return res.status(200).json({
        message: "Campaign deleted successfully",
      });
    } catch (error) {
      if (sendCampaignCommandError(res, error)) return;
      logger.error("Error deleting campaign", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to delete campaign",
      });
    }
  },
);

/**
 * GET /api/campaigns/:campaignId/invitable-users
 * List all platform users who can be invited to this campaign.
 * Excludes: existing members and users with a pending invitation.
 * Requires: Campaign DM role
 */
router.get(
  "/:campaignId/invitable-users",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId } = req.params;

      const users = await productionCampaignHttpQueries.invitableUsers(campaignId);

      return res.status(200).json({ users });
    } catch (error) {
      logger.error("Error fetching invitable users", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch invitable users",
      });
    }
  },
);

/**
 * POST /api/campaigns/:campaignId/invite
 * Invite a user to join the campaign.
 * Creates a pending invitation that the user must accept.
 * Requires: Campaign DM role
 * Campaign membership management
 */
router.post(
  "/:campaignId/invite",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId } = req.params;
      const result = await campaignCommands.dispatch<
        InviteToCampaignCommand,
        Awaited<ReturnType<InviteToCampaign["execute"]>>
      >({
        type: INVITE_TO_CAMPAIGN,
        campaignId,
        invitedBy: req.session.userId!,
        userId: req.body.userId,
        expiresInDays: req.body.expiresInDays,
      });

      return res.status(201).json({
        message: "Invitation sent successfully",
        invitation: result.invitation,
      });
    } catch (error) {
      if (sendCampaignCommandError(res, error)) return;
      logger.error("Error inviting user to campaign", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to invite user",
      });
    }
  },
);

/**
 * DELETE /api/campaigns/:campaignId/members/:userId
 * Remove a member from the campaign
 * Requires: Campaign DM role
 * Cannot remove the DM
 */
router.delete(
  "/:campaignId/members/:userId",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, userId } = req.params;
      await campaignCommands.dispatch<RemoveCampaignMemberCommand, void>({
        type: REMOVE_CAMPAIGN_MEMBER,
        campaignId,
        userId,
      });

      return res.status(200).json({
        message: "Member removed successfully",
      });
    } catch (error) {
      if (sendCampaignCommandError(res, error)) return;
      logger.error("Error removing member from campaign", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to remove member",
      });
    }
  },
);

/**
 * PUT /api/campaigns/:campaignId/members/:userId/role
 * Change a member's role in the campaign
 * Requires: Campaign DM role
 * Only ONE DM per campaign, cannot change DM's role
 */
router.put(
  "/:campaignId/members/:userId/role",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, userId } = req.params;
      const updatedMembership = await campaignCommands.dispatch<
        ChangeCampaignMemberRoleCommand,
        Awaited<ReturnType<ChangeCampaignMemberRole["execute"]>>
      >({
        type: CHANGE_CAMPAIGN_MEMBER_ROLE,
        campaignId,
        userId,
        role: req.body.role,
      });

      return res.status(200).json({
        message: "Member role updated successfully",
        membership: updatedMembership,
      });
    } catch (error) {
      if (sendCampaignCommandError(res, error)) return;
      logger.error("Error updating member role", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update member role",
      });
    }
  },
);

/**
 * GET /api/admin/campaigns
 * Get all campaigns in the system (Admin only)
 * Requires: Admin role
 */
router.get(
  "/admin/all",
  adminOnly,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const campaigns = await productionCampaignHttpQueries.all();

      return res.status(200).json({ campaigns });
    } catch (error) {
      logger.error("Error fetching all campaigns", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch campaigns",
      });
    }
  },
);

/**
 * GET /api/campaigns/:campaignId/messages
 * Get chat messages for a campaign
 * Requires: Campaign member
 * Chat Messages - Load last 50 messages with pagination
 */
router.get(
  "/:campaignId/messages",
  campaignMember,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId } = req.params;
      const { limit = "50", offset = "0" } = req.query;

      // Parse and validate pagination parameters
      const limitNum = parseInt(limit as string, 10);
      const offsetNum = parseInt(offset as string, 10);

      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return res.status(400).json({
          error: "Validation Error",
          message: "Limit must be between 1 and 100",
        });
      }

      if (isNaN(offsetNum) || offsetNum < 0) {
        return res.status(400).json({
          error: "Validation Error",
          message: "Offset must be a non-negative number",
        });
      }

      return res
        .status(200)
        .json(
          await productionCampaignHttpQueries.messages(
            campaignId,
            limitNum,
            offsetNum,
          ),
        );
    } catch (error) {
      logger.error("Error fetching messages", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch messages",
      });
    }
  },
);

/**
 * POST /api/campaigns/:campaignId/sessions
 * Start a new session
 * Requires: Campaign DM role
 * Starting a Session
 */
router.post(
  "/:campaignId/sessions",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId } = req.params;

      const session = await campaignSessionCommands.dispatch<
        StartCampaignSessionCommand,
        Awaited<ReturnType<StartCampaignSession["execute"]>>
      >({
        type: START_CAMPAIGN_SESSION,
        campaignId,
      });

      return res.status(201).json({
        message: "Session started successfully",
        session: {
          id: session.id,
          sessionNumber: session.sessionNumber,
          startedAt: session.startedAt,
        },
      });
    } catch (error) {
      if (sendSessionLifecycleError(res, error)) return;
      logger.error("Error starting session", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to start session",
      });
    }
  },
);

/**
 * PUT /api/campaigns/:campaignId/sessions/:sessionId/pause
 * Pause the current session
 * Requires: Campaign DM role
 * Pausing a Session
 */
router.put(
  "/:campaignId/sessions/:sessionId/pause",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, sessionId } = req.params;

      await campaignSessionCommands.dispatch<
        PauseCampaignSessionCommand,
        Awaited<ReturnType<PauseCampaignSession["execute"]>>
      >({
        type: PAUSE_CAMPAIGN_SESSION,
        campaignId,
        sessionId,
      });

      return res.status(200).json({
        message: "Session paused successfully",
        stateSaved: true,
      });
    } catch (error) {
      if (sendSessionLifecycleError(res, error)) return;
      logger.error("Error pausing session", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to pause session",
      });
    }
  },
);

/**
 * PUT /api/campaigns/:campaignId/sessions/:sessionId/end
 * End the current session and save state
 * Requires: Campaign DM role
 * Ending a Session
 */
router.put(
  "/:campaignId/sessions/:sessionId/end",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, sessionId } = req.params;
      const { saveState = true, notes } = req.body;

      const result = await campaignSessionCommands.dispatch<
        EndCampaignSessionCommand,
        Awaited<ReturnType<EndCampaignSession["execute"]>>
      >({
        type: END_CAMPAIGN_SESSION,
        campaignId,
        sessionId,
        saveState,
        notes,
      });
      return res.status(200).json({
        message: "Session ended successfully",
        stateSaved: result.stateSaved,
      });
    } catch (error) {
      if (sendSessionLifecycleError(res, error)) return;
      logger.error("Error ending session", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to end session",
      });
    }
  },
);

/**
 * PUT /api/campaigns/:campaignId/resume
 * Resume the last session by restoring saved state
 * Requires: Campaign DM role
 * Resuming a Session
 */
router.put(
  "/:campaignId/resume",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId } = req.params;

      const lastSession = await campaignSessionCommands.dispatch<
        ResumeCampaignSessionCommand,
        Awaited<ReturnType<ResumeCampaignSession["execute"]>>
      >({
        type: RESUME_CAMPAIGN_SESSION,
        campaignId,
      });

      return res.status(200).json({
        message: "Session resumed successfully",
        session: {
          id: lastSession.id,
          sessionNumber: lastSession.sessionNumber,
        },
      });
    } catch (error) {
      if (sendSessionLifecycleError(res, error)) return;
      logger.error("Error resuming session", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to resume session",
      });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// Campaign Export / Import
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/campaigns/:campaignId/export
 * Export campaign as a .cozyvtt ZIP archive.
 * Query params:
 *   includeAudio (boolean, default false)
 *   includeTokens (boolean, default true)
 * Requires: Campaign DM role
 */
router.get(
  "/:campaignId/export",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId } = req.params;
      const includeAudio = req.query.includeAudio === "true";
      const includeTokens = req.query.includeTokens !== "false"; // default true

      logger.info("Campaign export started", {
        campaignId,
        includeAudio,
        includeTokens,
        userId: req.session.userId,
      });

      const result = await campaignArchiveCommands.dispatch<
        ExportCampaignArchiveCommand,
        CampaignArchiveExport
      >({
        type: EXPORT_CAMPAIGN_ARCHIVE,
        campaignId,
        includeAudio,
        includeTokens,
      });

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.filename}"`,
      );
      res.setHeader("Content-Length", result.buffer.length);
      return res.send(result.buffer);
    } catch (error) {
      const normalizedError = asError(error);
      logger.error("Campaign export failed", {
        campaignId: req.params.campaignId,
        error: normalizedError.message,
      });

      if (normalizedError.message === "Campaign not found") {
        return res
          .status(404)
          .json({ error: "Not Found", message: "Campaign not found" });
      }

      return res.status(500).json({
        error: "Export Failed",
        message: "Failed to export campaign. Please try again.",
      });
    }
  },
);

/**
 * POST /api/campaigns/import/preview
 * Upload a .cozyvtt archive and return its manifest preview.
 * Does NOT create anything — just reads manifest.json.
 * Requires: Authentication
 */
router.post(
  "/import/preview",
  authenticated,
  (req: Request, res: Response, next: NextFunction): void => {
    importUpload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({
            error: "File Too Large",
            message: "Archive exceeds 500 MB limit.",
          });
          return;
        }
        res.status(400).json({ error: "Upload Error", message: err.message });
        return;
      }
      if (err) {
        res.status(400).json({ error: "Upload Error", message: err.message });
        return;
      }
      next();
    });
  },
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ error: "Validation Error", message: "No file uploaded." });
      }

      const preview = await campaignArchiveCommands.dispatch<
        PreviewCampaignArchiveImportCommand,
        CampaignArchivePreview
      >({
        type: PREVIEW_CAMPAIGN_ARCHIVE_IMPORT,
        archive: req.file.buffer,
      });
      return res.status(200).json({ preview });
    } catch (error) {
      const normalizedError = asError(error);
      logger.warn("Campaign import preview failed", { error: normalizedError.message });
      return res.status(400).json({
        error: "Invalid Archive",
        message: normalizedError.message || "Could not read archive.",
      });
    }
  },
);

/**
 * POST /api/campaigns/import
 * Upload a .cozyvtt archive and create a new campaign from it.
 * Body (multipart): file + optional JSON fields:
 *   campaignName (string) — override campaign name
 *   importTokens (boolean, default true)
 * Requires: Authentication, rate limited
 */
router.post(
  "/import",
  authenticated,
  (req: Request, res: Response, next: NextFunction): void => {
    importUpload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({
            error: "File Too Large",
            message: "Archive exceeds 500 MB limit.",
          });
          return;
        }
        res.status(400).json({ error: "Upload Error", message: err.message });
        return;
      }
      if (err) {
        res.status(400).json({ error: "Upload Error", message: err.message });
        return;
      }
      next();
    });
  },
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ error: "Validation Error", message: "No file uploaded." });
      }

      const userId = req.session.userId!;
      const importTokens = req.body.importTokens !== "false"; // default true
      const campaignName =
        typeof req.body.campaignName === "string"
          ? req.body.campaignName.trim()
          : undefined;

      logger.info("Campaign import started", {
        userId,
        importTokens,
        hasNameOverride: !!campaignName,
      });

      const result = await campaignArchiveCommands.dispatch<
        ImportCampaignArchiveCommand,
        CampaignArchiveImportResult
      >({
        type: IMPORT_CAMPAIGN_ARCHIVE,
        archive: req.file.buffer,
        userId,
        campaignName: req.body.campaignName,
        importTokens: req.body.importTokens,
      });

      return res.status(201).json({
        message: "Campaign imported successfully",
        ...result,
      });
    } catch (error) {
      const normalizedError = asError(error);
      logger.error("Campaign import failed", {
        error: normalizedError.message,
        userId: req.session?.userId,
      });
      if (error instanceof CampaignArchiveError) {
        return res
          .status(400)
          .json({ error: "Validation Error", message: error.message });
      }
      return res.status(400).json({
        error: "Import Failed",
        message: normalizedError.message || "Failed to import campaign.",
      });
    }
  },
);

export default router;
