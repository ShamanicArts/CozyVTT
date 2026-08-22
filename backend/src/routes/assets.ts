import { Router, Response } from "express";
import rateLimit from "express-rate-limit";
import { AuthenticatedRequest } from "../middleware/rbac";
import { authenticated } from "../middleware/compose";
import { prisma } from "../config/database";
import {
  UploadRequest,
  uploadGeneric,
  handleUploadError,
} from "../middleware/upload";
import {
  validateFileType,
  validateFileSize,
} from "../middleware/fileValidation";
import { AssetType, AssetScope, deleteFile } from "../utils/fileUtils";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import logger from "../utils/logger";
import { productionCommandBus } from "../composition/productionApplicationHost";
import {
  CREATE_ASSET,
  CreateAsset,
  CreateAssetCommand,
  DELETE_ASSET,
  DeleteAssetCommand,
  isAssetMutationError,
  PREPARE_ASSET_UPLOAD,
  PrepareAssetUpload,
  PrepareAssetUploadCommand,
  UPDATE_ASSET_SCOPE,
  UpdateAssetScope,
  UpdateAssetScopeCommand,
} from "../application/assets/AssetMutations";

const router = Router();

// HTTP owns multipart parsing and byte inspection; the command bus owns asset
// authorization and mutations so capability/extension adapters can reuse them.
const assetCommands = productionCommandBus;

function assetActor(req: AuthenticatedRequest) {
  return {
    userId: req.session.userId!,
    isAdmin: req.session.platformRole === "ADMIN",
  };
}

function sendAssetMutationError(res: Response, error: unknown): boolean {
  if (!isAssetMutationError(error)) return false;
  res.status(error.status).json({ error: error.error, message: error.message });
  return true;
}

/**
 * Per-user rate limiter for asset uploads. Sized to allow legitimate bulk
 * upload during campaign setup (a DM placing tokens for a new dungeon may
 * upload 20+ images in a couple of minutes) while blocking obvious abuse
 * (e.g. a script trying to exhaust storage). Keyed by user id so one user's
 * activity does not penalize others on the same NAT.
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.ASSET_UPLOAD_RATE_LIMIT || "30"),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const session = (req as AuthenticatedRequest).session;
    return session?.userId ?? req.ip ?? "anonymous";
  },
  message: {
    error: "Too Many Requests",
    message:
      "Upload rate limit reached. Please slow down and try again in a minute.",
  },
});

/**
 * Normalize a stored file path for cross-platform compatibility.
 * Converts Windows backslashes to forward slashes so paths recorded during
 * local Windows development (npm run dev) resolve correctly in Linux Docker.
 */
function normalizePath(filePath: string): string {
  return path.resolve(filePath.replace(/\\/g, "/"));
}

/**
 * Set cache headers for a served asset and answer conditional requests.
 * Asset files are stored under UUID filenames and never mutated in place
 * (re-upload creates a new asset row), so asset-id URLs can be cached as
 * immutable. Avatar URLs are keyed by USER id and resolve to the newest
 * AVATAR asset, so they get a short max-age instead — the ETag still
 * changes when a new avatar is uploaded, keeping 304 revalidation correct.
 *
 * Must be called AFTER permission checks (a 304 must not leak asset
 * existence to non-members). Returns true if a 304 was sent and the
 * caller should stop.
 */
function handleAssetCaching(
  req: AuthenticatedRequest,
  res: Response,
  assetId: string,
  { immutable = true }: { immutable?: boolean } = {},
): boolean {
  const etag = `"${assetId}"`;
  res.set(
    "Cache-Control",
    immutable ? "private, max-age=31536000, immutable" : "private, max-age=300",
  );
  res.set("ETag", etag);
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return true;
  }
  return false;
}

/**
 * Asset Management Routes
 * Asset Endpoints
 */

/**
 * GET /api/assets
 * List assets with optional filtering
 * Requires: Authentication
 * Query params:
 *   - type: Filter by AssetType (MAP, TOKEN, AUDIO, AVATAR)
 *   - scope: Filter by AssetScope (GLOBAL, CAMPAIGN)
 *   - campaignId: Filter by campaign (requires CAMPAIGN scope or returns campaign-specific assets)
 */
router.get(
  "/",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { type, scope, campaignId, page, limit, search, uploadedBy } =
        req.query;

      // Pagination parameters
      const pageNum = parseInt(page as string) || 1;
      const limitNum = Math.min(parseInt(limit as string) || 50, 100); // Max 100 per page
      const skip = (pageNum - 1) * limitNum;

      // Build filter conditions
      const where: any = {};

      // Type filter
      if (type) {
        where.type = type as AssetType;
      }

      // Scope filter
      if (scope) {
        where.scope = scope as AssetScope;
      }

      // Name search
      if (search) {
        where.name = { contains: search as string, mode: "insensitive" };
      }

      // Campaign filter
      const isAdmin = req.session.platformRole === "ADMIN";

      // Admin-only: filter by uploader
      if (uploadedBy && isAdmin) {
        where.uploadedById = uploadedBy as string;
      }

      if (campaignId) {
        // Admin bypasses membership check
        if (!isAdmin) {
          const membership = await prisma.campaignMembership.findUnique({
            where: {
              userId_campaignId: {
                userId,
                campaignId: campaignId as string,
              },
            },
          });

          if (!membership) {
            return res.status(403).json({
              error: "Forbidden",
              message: "You do not have access to this campaign",
            });
          }
        }

        where.campaignId = campaignId;
      } else if (!isAdmin) {
        // Non-admin: enforce three-scope visibility rules
        const userMemberships = await prisma.campaignMembership.findMany({
          where: { userId },
          select: { campaignId: true },
        });

        const campaignIds = userMemberships.map(
          (m: { campaignId: string }) => m.campaignId,
        );

        where.OR = [
          { scope: "GLOBAL" }, // Platform-wide assets
          { scope: "USER", uploadedById: userId }, // User's own personal assets
          ...campaignIds.map((cId: string) => ({
            scope: "CAMPAIGN",
            campaignId: cId,
          })), // Campaign assets
        ];
      }
      // Admin with no campaignId: no OR filter — sees all assets across all scopes/users

      // Get total count for pagination
      const total = await prisma.asset.count({ where });

      // Get paginated assets
      const assets = await prisma.asset.findMany({
        where,
        include: {
          uploadedBy: {
            select: {
              id: true,
              displayName: true,
            },
          },
          campaign: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limitNum,
      });

      return res.json({
        assets,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      logger.error("Error listing assets", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to list assets",
      });
    }
  },
);

/**
 * POST /api/assets/upload
 * Upload a new asset
 * Requires: Authentication
 * Body (multipart/form-data):
 *   - file: The file to upload
 *   - type: AssetType (MAP, TOKEN, AUDIO, AVATAR)
 *   - scope: AssetScope (GLOBAL, CAMPAIGN)
 *   - campaignId: Required if scope is CAMPAIGN
 *   - name: Asset name (optional, defaults to original filename)
 *   - description: Asset description (optional)
 *   - tags: Comma-separated tags (optional)
 */
router.post(
  "/upload",
  authenticated,
  uploadLimiter,
  // First, use a generic upload to parse the multipart data
  (req: UploadRequest, res: Response, next: any) => {
    // Use generic uploader - no asset-type-specific filtering yet
    uploadGeneric.single("file")(req, res, (err: any) => {
      if (err) {
        return handleUploadError(err, req, res, next);
      }
      next();
    });
  },
  // Multipart metadata is now available. The command supplies normalized
  // type/scope for the byte-validation middleware that follows.
  async (req: UploadRequest, res: Response, next: any) => {
    try {
      const prepared = await assetCommands.dispatch<
        PrepareAssetUploadCommand,
        Awaited<ReturnType<PrepareAssetUpload["execute"]>>
      >({
        type: PREPARE_ASSET_UPLOAD,
        actor: assetActor(req),
        input: req.body,
      });
      req.assetType = prepared.type;
      req.assetScope = prepared.scope;
      req.campaignId = prepared.campaignId ?? undefined;

      return next();
    } catch (error) {
      if (sendAssetMutationError(res, error)) {
        if (req.file?.path) {
          try {
            await deleteFile(req.file.path);
          } catch (deleteError) {
            logger.error("Error deleting file after validation error", {
              err: deleteError,
            });
          }
        }
        return;
      }
      logger.error("Error in upload validation", { err: error });
      // Clean up uploaded file
      if (req.file?.path) {
        try {
          await deleteFile(req.file.path);
        } catch (deleteError) {
          logger.error("Error deleting file after validation error", {
            err: deleteError,
          });
        }
      }
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to process upload request",
      });
    }
  },
  validateFileType,
  validateFileSize,
  async (req: UploadRequest, res: Response) => {
    try {
      const { name, description, tags } = req.body;
      const file = req.file!;

      // Parse tags if provided
      const tagArray = tags
        ? tags
            .split(",")
            .map((tag: string) => tag.trim())
            .filter(Boolean)
        : [];

      // Generate thumbnail for images (MAP and TOKEN types)
      let thumbnailPath: string | null = null;
      if (
        (req.assetType === "MAP" || req.assetType === "TOKEN") &&
        file.mimetype.startsWith("image/")
      ) {
        try {
          const thumbnailFilename = `thumb_${file.filename}`;
          const thumbnailDir = path.dirname(file.path);
          thumbnailPath = path.join(thumbnailDir, thumbnailFilename);

          await sharp(file.path)
            .resize(512, 512, {
              fit: "inside", // Maintain aspect ratio
              withoutEnlargement: true, // Don't upscale small images
            })
            .toFile(thumbnailPath);
        } catch (thumbnailError) {
          logger.error("Error generating thumbnail", { err: thumbnailError });
          // Don't fail the upload if thumbnail generation fails
          thumbnailPath = null;
        }
      }

      // Normalize paths: convert Windows backslashes to forward slashes so
      // paths stored during local dev also work in Linux Docker containers.
      const asset = await assetCommands.dispatch<
        CreateAssetCommand,
        Awaited<ReturnType<CreateAsset["execute"]>>
      >({
        type: CREATE_ASSET,
        actor: assetActor(req),
        input: req.body,
        metadata: {
          filename: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          filePath: file.path.replace(/\\/g, "/"),
          thumbnailPath: thumbnailPath
            ? thumbnailPath.replace(/\\/g, "/")
            : null,
          name: name || file.originalname,
          description: description || null,
          tags: tagArray,
        },
      });

      return res.status(201).json({
        message: "Asset uploaded successfully",
        asset,
      });
    } catch (error) {
      if (sendAssetMutationError(res, error)) return;
      logger.error("Error creating asset record", { err: error });

      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to save asset",
      });
    }
  },
);

/**
 * GET /api/assets/:id
 * Get asset metadata by ID
 * Requires: Authentication
 * Returns: Asset metadata (without file data)
 */
router.get(
  "/:id",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.session.userId!;

      const asset = await prisma.asset.findUnique({
        where: { id },
        include: {
          uploadedBy: {
            select: {
              id: true,
              displayName: true,
            },
          },
          campaign: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!asset) {
        return res.status(404).json({
          error: "Not Found",
          message: "Asset not found",
        });
      }

      const isAdmin = req.session.platformRole === "ADMIN";

      // USER-scoped assets: only owner or admin can access
      if (asset.scope === "USER" && asset.uploadedById !== userId && !isAdmin) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You do not have access to this asset",
        });
      }

      // CAMPAIGN-scoped assets: only campaign members can access
      if (asset.scope === "CAMPAIGN" && asset.campaignId && !isAdmin) {
        const membership = await prisma.campaignMembership.findUnique({
          where: {
            userId_campaignId: {
              userId,
              campaignId: asset.campaignId,
            },
          },
        });

        if (!membership) {
          return res.status(403).json({
            error: "Forbidden",
            message: "You do not have access to this asset",
          });
        }
      }

      return res.json({ asset });
    } catch (error) {
      logger.error("Error fetching asset", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch asset",
      });
    }
  },
);

/**
 * DELETE /api/assets/:id
 * Delete an asset
 * Requires: Authentication + ownership or campaign DM
 */
router.delete(
  "/:id",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      await assetCommands.dispatch<DeleteAssetCommand, void>({
        type: DELETE_ASSET,
        actor: assetActor(req),
        assetId: id,
      });

      return res.json({
        message: "Asset deleted successfully",
      });
    } catch (error) {
      if (sendAssetMutationError(res, error)) return;
      logger.error("Error deleting asset", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to delete asset",
      });
    }
  },
);

/**
 * GET /api/assets/:id/download
 * Download an asset file
 * Requires: Authentication + access to asset
 */
router.get(
  "/:id/download",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.session.userId!;

      const asset = await prisma.asset.findUnique({
        where: { id },
      });

      if (!asset) {
        return res.status(404).json({
          error: "Not Found",
          message: "Asset not found",
        });
      }

      // Check access permissions
      const isAdminDownload = req.session.platformRole === "ADMIN";
      if (
        asset.scope === "USER" &&
        asset.uploadedById !== userId &&
        !isAdminDownload
      ) {
        return res
          .status(403)
          .json({
            error: "Forbidden",
            message: "You do not have access to this asset",
          });
      }
      if (asset.scope === "CAMPAIGN" && asset.campaignId && !isAdminDownload) {
        const membership = await prisma.campaignMembership.findUnique({
          where: {
            userId_campaignId: { userId, campaignId: asset.campaignId },
          },
        });
        if (!membership) {
          return res
            .status(403)
            .json({
              error: "Forbidden",
              message: "You do not have access to this asset",
            });
        }
      }

      // Check if file exists (normalize path for cross-platform compatibility)
      const downloadPath = normalizePath(asset.filePath);
      if (!fs.existsSync(downloadPath)) {
        return res.status(404).json({
          error: "Not Found",
          message: "Asset file not found on server",
        });
      }

      // Send file with original name
      return res.download(downloadPath, asset.originalName);
    } catch (error) {
      logger.error("Error downloading asset", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to download asset",
      });
    }
  },
);

/**
 * GET /api/assets/maps/:id
 * Serve a map image
 * Requires: Authentication + access to asset
 */
router.get(
  "/maps/:id",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.session.userId!;

      const asset = await prisma.asset.findUnique({
        where: { id, type: "MAP" },
      });

      if (!asset) {
        return res.status(404).json({
          error: "Not Found",
          message: "Map asset not found",
        });
      }

      // Check access permissions
      const isAdminMap = req.session.platformRole === "ADMIN";
      if (
        asset.scope === "USER" &&
        asset.uploadedById !== userId &&
        !isAdminMap
      ) {
        return res
          .status(403)
          .json({
            error: "Forbidden",
            message: "You do not have access to this asset",
          });
      }
      if (asset.scope === "CAMPAIGN" && asset.campaignId && !isAdminMap) {
        const membership = await prisma.campaignMembership.findUnique({
          where: {
            userId_campaignId: { userId, campaignId: asset.campaignId },
          },
        });
        if (!membership) {
          return res
            .status(403)
            .json({
              error: "Forbidden",
              message: "You do not have access to this asset",
            });
        }
      }

      // Check if file exists (normalize path for cross-platform compatibility)
      const mapPath = normalizePath(asset.filePath);
      if (!fs.existsSync(mapPath)) {
        return res.status(404).json({
          error: "Not Found",
          message: "Asset file not found on server",
        });
      }

      // Send file with appropriate content type
      if (handleAssetCaching(req, res, asset.id)) return;
      return res.sendFile(mapPath);
    } catch (error) {
      logger.error("Error serving map", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to serve map",
      });
    }
  },
);

/**
 * GET /api/assets/tokens/:id
 * Serve a token image
 * Requires: Authentication + access to asset
 */
router.get(
  "/tokens/:id",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.session.userId!;

      const asset = await prisma.asset.findUnique({
        where: { id, type: "TOKEN" },
      });

      if (!asset) {
        return res.status(404).json({
          error: "Not Found",
          message: "Token asset not found",
        });
      }

      // Check access permissions
      const isAdminToken = req.session.platformRole === "ADMIN";
      if (
        asset.scope === "USER" &&
        asset.uploadedById !== userId &&
        !isAdminToken
      ) {
        return res
          .status(403)
          .json({
            error: "Forbidden",
            message: "You do not have access to this asset",
          });
      }
      if (asset.scope === "CAMPAIGN" && asset.campaignId && !isAdminToken) {
        const membership = await prisma.campaignMembership.findUnique({
          where: {
            userId_campaignId: { userId, campaignId: asset.campaignId },
          },
        });
        if (!membership) {
          return res
            .status(403)
            .json({
              error: "Forbidden",
              message: "You do not have access to this asset",
            });
        }
      }

      // Check if file exists (normalize path for cross-platform compatibility)
      const tokenPath = normalizePath(asset.filePath);
      if (!fs.existsSync(tokenPath)) {
        return res.status(404).json({
          error: "Not Found",
          message: "Asset file not found on server",
        });
      }

      // Send file with appropriate content type
      if (handleAssetCaching(req, res, asset.id)) return;
      return res.sendFile(tokenPath);
    } catch (error) {
      logger.error("Error serving token", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to serve token",
      });
    }
  },
);

/**
 * GET /api/assets/audio/:id
 * Stream an audio file
 * Requires: Authentication + access to asset
 */
router.get(
  "/audio/:id",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.session.userId!;

      const asset = await prisma.asset.findUnique({
        where: { id, type: "AUDIO" },
      });

      if (!asset) {
        return res.status(404).json({
          error: "Not Found",
          message: "Audio asset not found",
        });
      }

      // Check access permissions
      const isAdminAudio = req.session.platformRole === "ADMIN";
      if (
        asset.scope === "USER" &&
        asset.uploadedById !== userId &&
        !isAdminAudio
      ) {
        return res
          .status(403)
          .json({
            error: "Forbidden",
            message: "You do not have access to this asset",
          });
      }
      if (asset.scope === "CAMPAIGN" && asset.campaignId && !isAdminAudio) {
        const membership = await prisma.campaignMembership.findUnique({
          where: {
            userId_campaignId: { userId, campaignId: asset.campaignId },
          },
        });
        if (!membership) {
          return res
            .status(403)
            .json({
              error: "Forbidden",
              message: "You do not have access to this asset",
            });
        }
      }

      // Check if file exists (normalize path for cross-platform compatibility)
      const audioPath = normalizePath(asset.filePath);
      if (!fs.existsSync(audioPath)) {
        return res.status(404).json({
          error: "Not Found",
          message: "Asset file not found on server",
        });
      }

      // Stream audio file
      const stat = fs.statSync(audioPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        // Handle range requests for streaming
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const file = fs.createReadStream(audioPath, { start, end });
        const head = {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": asset.mimeType,
        };
        res.writeHead(206, head);
        return file.pipe(res);
      } else {
        // No range, send entire file
        const head = {
          "Content-Length": fileSize,
          "Content-Type": asset.mimeType,
        };
        res.writeHead(200, head);
        return fs.createReadStream(audioPath).pipe(res);
      }
    } catch (error) {
      logger.error("Error streaming audio", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to stream audio",
      });
    }
  },
);

/**
 * GET /api/assets/avatars/:userId
 * Serve a user's avatar
 * Requires: Authentication
 * Note: Any authenticated user can view avatars (for chat, campaign members list, etc.)
 */
router.get(
  "/avatars/:userId",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;

      // Find the user's avatar asset
      const asset = await prisma.asset.findFirst({
        where: {
          type: "AVATAR",
          uploadedById: userId,
        },
        orderBy: {
          createdAt: "desc", // Get most recent avatar
        },
      });

      if (!asset) {
        return res.status(404).json({
          error: "Not Found",
          message: "User avatar not found",
        });
      }

      // Check if file exists (normalize path for cross-platform compatibility)
      const avatarPath = normalizePath(asset.filePath);
      if (!fs.existsSync(avatarPath)) {
        return res.status(404).json({
          error: "Not Found",
          message: "Avatar file not found on server",
        });
      }

      // Send file with appropriate content type. Avatar URLs are per-USER and
      // resolve to the newest upload, so they are not immutable — short max-age
      // plus ETag revalidation keeps them fresh without a full re-download.
      if (handleAssetCaching(req, res, asset.id, { immutable: false })) return;
      return res.sendFile(avatarPath);
    } catch (error) {
      logger.error("Error serving avatar", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to serve avatar",
      });
    }
  },
);

/**
 * PATCH /api/assets/:id/scope
 * Change the scope of an asset.
 * Body: { scope: 'GLOBAL' | 'USER' | 'CAMPAIGN', campaignId?: string }
 *
 * Permission matrix:
 *   Admin / globalAssetManager → any move including to/from GLOBAL
 *   Owner → USER → CAMPAIGN (own campaign), CAMPAIGN → USER, CAMPAIGN → CAMPAIGN
 *   Campaign DM (not owner) → CAMPAIGN → USER, CAMPAIGN → CAMPAIGN (source campaign only)
 */
router.patch(
  "/:id/scope",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { scope, campaignId } = req.body;
      const updated = await assetCommands.dispatch<
        UpdateAssetScopeCommand,
        Awaited<ReturnType<UpdateAssetScope["execute"]>>
      >({
        type: UPDATE_ASSET_SCOPE,
        actor: assetActor(req),
        assetId: id,
        input: { scope, campaignId },
      });

      return res.json({
        message: "Asset scope updated successfully",
        asset: updated,
      });
    } catch (error) {
      if (sendAssetMutationError(res, error)) return;
      logger.error("Error updating asset scope", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update asset scope",
      });
    }
  },
);

export default router;
