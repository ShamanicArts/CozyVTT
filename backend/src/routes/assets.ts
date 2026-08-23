import { Router, Response } from "express";
import rateLimit from "express-rate-limit";
import { AuthenticatedRequest } from "../middleware/rbac";
import { authenticated } from "../middleware/compose";
import {
  UploadRequest,
  uploadGeneric,
  handleUploadError,
} from "../middleware/upload";
import {
  validateFileType,
  validateFileSize,
} from "../middleware/fileValidation";
import logger from "../utils/logger";
import { productionTransportCommands } from "../composition/productionTransportCommands";
import {
  CREATE_ASSET,
  CreateAsset,
  CreateAssetCommand,
  DELETE_ASSET,
  DeleteAssetCommand,
  DISCARD_ASSET_UPLOAD,
  isAssetMutationError,
  PREPARE_ASSET_UPLOAD,
  PrepareAssetUpload,
  PrepareAssetUploadCommand,
  UPDATE_ASSET_SCOPE,
  UpdateAssetScope,
  UpdateAssetScopeCommand,
} from "../application/assets/AssetMutations";
import { AssetQueryError } from "../application/assets/AssetQueries";
import { productionAssetQueries } from "../composition/productionAssetQueries";

const router = Router();

// HTTP owns multipart parsing and byte inspection; the command bus owns asset
// authorization and mutations so capability/extension adapters can reuse them.
const assetCommands = productionTransportCommands;

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

function sendAssetQueryError(res: Response, error: unknown): boolean {
  if (!(error instanceof AssetQueryError)) return false;
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
      const isAdmin = req.session.platformRole === "ADMIN";
      return res.json(
        await productionAssetQueries.list({
          userId,
          isAdmin,
          type: typeof type === "string" ? type : undefined,
          scope: typeof scope === "string" ? scope : undefined,
          campaignId: typeof campaignId === "string" ? campaignId : undefined,
          search: typeof search === "string" ? search : undefined,
          uploadedBy: typeof uploadedBy === "string" ? uploadedBy : undefined,
          page: pageNum,
          limit: limitNum,
        }),
      );
    } catch (error) {
      if (sendAssetQueryError(res, error)) return;
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
          await assetCommands.dispatch({
            type: DISCARD_ASSET_UPLOAD,
            filePath: req.file.path,
          });
        }
        return;
      }
      logger.error("Error in upload validation", { err: error });
      // Clean up uploaded file
      if (req.file?.path) {
        await assetCommands.dispatch({
          type: DISCARD_ASSET_UPLOAD,
          filePath: req.file.path,
        });
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
          thumbnailPath = await productionAssetQueries.createThumbnail(
            file.path,
            file.filename,
          );
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

      const asset = await productionAssetQueries.metadata(
        { userId, isAdmin: req.session.platformRole === "ADMIN" },
        id,
      );

      return res.json({ asset });
    } catch (error) {
      if (sendAssetQueryError(res, error)) return;
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

      const { asset, contents } = await productionAssetQueries.file(
        { userId, isAdmin: req.session.platformRole === "ADMIN" },
        id,
        {
          missingAsset: "Asset not found",
          missingFile: "Asset file not found on server",
        },
      );
      res.attachment(asset.originalName);
      res.type(asset.mimeType);
      return res.send(contents);
    } catch (error) {
      if (sendAssetQueryError(res, error)) return;
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

      const { asset, contents } = await productionAssetQueries.file(
        { userId, isAdmin: req.session.platformRole === "ADMIN" },
        id,
        {
          type: "MAP",
          missingAsset: "Map asset not found",
          missingFile: "Asset file not found on server",
        },
      );

      // Send file with appropriate content type
      if (handleAssetCaching(req, res, asset.id)) return;
      res.type(asset.mimeType);
      return res.send(contents);
    } catch (error) {
      if (sendAssetQueryError(res, error)) return;
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

      const { asset, contents } = await productionAssetQueries.file(
        { userId, isAdmin: req.session.platformRole === "ADMIN" },
        id,
        {
          type: "TOKEN",
          missingAsset: "Token asset not found",
          missingFile: "Asset file not found on server",
        },
      );

      // Send file with appropriate content type
      if (handleAssetCaching(req, res, asset.id)) return;
      res.type(asset.mimeType);
      return res.send(contents);
    } catch (error) {
      if (sendAssetQueryError(res, error)) return;
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

      const { asset, contents } = await productionAssetQueries.file(
        { userId, isAdmin: req.session.platformRole === "ADMIN" },
        id,
        {
          type: "AUDIO",
          missingAsset: "Audio asset not found",
          missingFile: "Asset file not found on server",
        },
      );

      // Stream audio file
      const fileSize = contents.length;
      const range = req.headers.range;

      if (range) {
        // Handle range requests for streaming
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const chunk = contents.subarray(start, end + 1);
        const head = {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": asset.mimeType,
        };
        res.writeHead(206, head);
        return res.end(chunk);
      } else {
        // No range, send entire file
        const head = {
          "Content-Length": fileSize,
          "Content-Type": asset.mimeType,
        };
        res.writeHead(200, head);
        return res.end(contents);
      }
    } catch (error) {
      if (sendAssetQueryError(res, error)) return;
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

      const { asset, contents } = await productionAssetQueries.avatar(userId);

      // Send file with appropriate content type. Avatar URLs are per-USER and
      // resolve to the newest upload, so they are not immutable — short max-age
      // plus ETag revalidation keeps them fresh without a full re-download.
      if (handleAssetCaching(req, res, asset.id, { immutable: false })) return;
      res.type(asset.mimeType);
      return res.send(contents);
    } catch (error) {
      if (sendAssetQueryError(res, error)) return;
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
