import { Router, Response } from "express";
import { randomUUID } from "crypto";
import path from "path";
import multer from "multer";
import { AuthenticatedRequest } from "../middleware/rbac";
import { campaignMember, campaignDM } from "../middleware/compose";
import { filterMapData } from "../utils/spirit-layer";
import { productionRealtimeQueries } from "../composition/productionRealtimeQueries";
import { productionCampaignEvents } from "../composition/productionCampaignEvents";
import {
  WallSegmentSchema,
  WallSegmentsArraySchema,
  FogOperationSchema,
  LightSourceSchema,
  LightSourcesArraySchema,
  LightSourceUpdateSchema,
} from "../validators/walls";
import type { WallSegment, FogState, LightSource } from "../types/walls";
import {
  ADD_LIGHT_SOURCE,
  AddLightSourceCommand,
  ADD_WALL_SEGMENT,
  AddWallSegmentCommand,
  APPLY_FOG_OPERATION,
  ApplyFogOperationCommand,
  REMOVE_LIGHT_SOURCE,
  RemoveLightSourceCommand,
  REMOVE_WALL_SEGMENT,
  RemoveWallSegmentCommand,
  REPLACE_LIGHT_SOURCES,
  ReplaceLightSourcesCommand,
  REPLACE_WALL_SEGMENTS,
  ReplaceWallSegmentsCommand,
  SET_SCENE_LIGHTING_ENABLED,
  SetSceneLightingEnabledCommand,
  UPDATE_LIGHT_SOURCE,
  UpdateLightSourceCommand,
  UPDATE_WALL_SEGMENT,
  UpdateWallSegmentCommand,
} from "../application/scene/SceneMutations";
import { loadFogState, SceneRole } from "../domain/scene/Scene";
import logger from "../utils/logger";
import {
  CREATE_MAP,
  DELETE_MAP,
  SET_CURRENT_MAP,
  UPDATE_MAP,
  CreateMap,
  CreateMapCommand,
  DeleteMapCommand,
  SetCurrentMap,
  SetCurrentMapCommand,
  UpdateMap,
  UpdateMapCommand,
} from "../application/maps/MapLifecycleCommands";
import { MapLifecycleError } from "../domain/maps/MapLifecycle";
import { MapRevisionConflictError } from "../domain/maps/MapRevision";
import {
  CREATE_MAP_TOKEN,
  CreateMapTokenCommand,
  DELETE_MAP_TOKEN,
  DeleteMapTokenCommand,
  MapTokenMutationResult,
  UPDATE_MAP_TOKEN,
  UpdateMapTokenCommand,
} from "../application/mapTokens/MapTokenMutations";
import { MapTokenError } from "../domain/mapTokens/MapToken";
import { productionTransportCommands } from "../composition/productionTransportCommands";
import {
  IMPORT_UVTT_MAP,
  ImportUvttMapCommand,
  ImportUvttMapResult,
  UvttImportError,
} from "../application/maps/UvttMapImportCommands";
import {
  UvttMapExportError,
} from "../application/maps/UvttMapExport";
import { productionUvttMapExport } from "../composition/productionUvttMapExport";

/** Multer configured for UVTT file uploads (memory storage — files are small JSON). */
const uvttUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB — UVTT files can be large (embedded image)
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (
      [".uvtt", ".dd2vtt", ".df2vtt"].includes(ext) ||
      file.mimetype === "application/json"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only .uvtt, .dd2vtt, and .df2vtt files are supported"));
    }
  },
});

const router = Router({ mergeParams: true }); // Important: Merge params from parent router

// HTTP remains a transport adapter. Core map lifecycle behaviour is shared
// with Socket.IO commands instead of coupling those surfaces to Prisma.
const mapCoreCommands = productionTransportCommands;
const uvttImportCommands = productionTransportCommands;

function sendMapLifecycleError(res: Response, error: unknown): boolean {
  if (error instanceof MapRevisionConflictError) {
    res.status(409).json({
      error: "Conflict",
      message: "Map state changed; refresh the map and retry",
      expectedRevision: error.expectedRevision,
    });
    return true;
  }
  if (!(error instanceof MapLifecycleError)) return false;
  res.status(error.status).json({ error: error.error, message: error.message });
  return true;
}

// REST is a transport adapter. These bindings share the same scene use cases
// as the Socket.IO map-edit handlers while preserving this route's established
// HTTP validation, status codes, payloads, and broadcasts.
const sceneCommands = productionTransportCommands;

function sceneActor(campaignId: string, req?: AuthenticatedRequest) {
  return {
    campaignId,
    role: (req?.campaignMembership?.role ?? "DM") as SceneRole,
  };
}

const mapTokenCommands = productionTransportCommands;

/**
 * Map CRUD Routes
 * Map Endpoints
 *
 * All routes are prefixed with /api/campaigns/:campaignId/maps
 */

/**
 * POST /api/campaigns/:campaignId/maps
 * Create a new map for the campaign
 * Requires: DM role
 */
router.post(
  "/",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId } = req.params;
      const map = await mapCoreCommands.dispatch<
        CreateMapCommand,
        Awaited<ReturnType<CreateMap["execute"]>>
      >({
        type: CREATE_MAP,
        campaignId,
        input: req.body as Record<string, unknown>,
      });
      return res.status(201).json({ map });
    } catch (error) {
      if (sendMapLifecycleError(res, error)) return;
      logger.error("Error creating map", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to create map",
      });
    }
  },
);

/**
 * GET /api/campaigns/:campaignId/maps
 * List all maps for the campaign
 * Requires: Campaign membership
 */
router.get(
  "/",
  campaignMember,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId } = req.params;

      const maps = await productionRealtimeQueries.mapSummaries(campaignId);

      return res.status(200).json({ maps });
    } catch (error) {
      logger.error("Error fetching maps", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch maps",
      });
    }
  },
);

/**
 * POST /api/campaigns/:campaignId/maps/import-uvtt
 * Import a Universal VTT (.uvtt / .dd2vtt) file.
 *
 * Creates a new map from the embedded image and wall data.
 * The UVTT format is exported by Dungeondraft, DunGen, Dungeon Alchemist, etc.
 * Requires: DM role
 */
router.post(
  "/import-uvtt",
  campaignDM,
  uvttUpload.single("file"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId } = req.params;
      const userId = req.session?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      if (!req.file?.buffer) {
        return res.status(400).json({
          error: "Validation Error",
          message: "No UVTT file uploaded",
        });
      }

      const mapName =
        (req.body.name as string)?.trim() ||
        path.basename(
          req.file.originalname,
          path.extname(req.file.originalname),
        );
      const gridSizePx = Number(req.body.gridSize) || 70;

      const result = await uvttImportCommands.dispatch<
        ImportUvttMapCommand,
        ImportUvttMapResult
      >({
        type: IMPORT_UVTT_MAP,
        campaignId,
        uploadedById: userId,
        name: mapName,
        contents: req.file.buffer,
        gridSize: gridSizePx,
      });

      logger.info(
        `[uvtt-import] Created map "${mapName}" with ${result.wallCount} walls, ` +
          `${result.portalCount} doors, and ${result.lightCount} lights`,
      );

      return res.status(201).json(result);
    } catch (error) {
      if (error instanceof UvttImportError)
        return res
          .status(400)
          .json({ error: "Parse Error", message: error.message });
      logger.error("Error importing UVTT file:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to import UVTT file",
      });
    }
  },
);

/**
 * GET /api/campaigns/:campaignId/maps/:id/export-uvtt
 * Export a map as a Universal VTT (.uvtt) file download.
 * Includes the map image, wall segments, portals, and light sources.
 * Requires: DM role
 */
router.get(
  "/:id/export-uvtt",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id } = req.params;

      const exported = await productionUvttMapExport.execute(campaignId, id);
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${exported.filename}.uvtt"`,
      );
      res.setHeader("Content-Length", exported.contents.length);
      return res.send(exported.contents);
    } catch (error) {
      if (error instanceof UvttMapExportError)
        return res
          .status(error.status)
          .json({ error: error.error, message: error.message });
      logger.error("Error exporting UVTT file:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to export UVTT file",
      });
    }
  },
);

/**
 * GET /api/campaigns/:campaignId/maps/:id
 * Get a specific map with full data including tokens
 * Requires: Campaign membership
 *
 * Spirit Layer tokens filtered server-side
 * - DM always sees all tokens on both layers
 * - Players see spirit tokens only when spiritLayerEnabled is true
 * - Hidden tokens (visible: false) only visible to DM
 * - Spirit layer URL hidden from non-privileged users
 */
router.get(
  "/:id",
  campaignMember,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id } = req.params;
      const userId = req.session.userId!;

      const map = await productionRealtimeQueries.mapForCampaign(campaignId, id);
      if (!map) {
        return res.status(404).json({
          error: "Not Found",
          message: "Map not found in this campaign",
        });
      }
      const role = await productionRealtimeQueries.campaignRole(
        userId,
        campaignId,
      );
      if (!role) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You are not a member of this campaign",
        });
      }

      // Get spirit layer visibility for this user
      const spiritVisible = await productionRealtimeQueries.canSeeSpiritLayer(
        campaignId,
        userId,
      );

      // Filter map data based on role and spirit visibility
      const responseMap = filterMapData(map as any, role, spiritVisible);

      return res.status(200).json({ map: responseMap, spiritVisible });
    } catch (error) {
      logger.error("Error fetching map", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch map",
      });
    }
  },
);

/**
 * PUT /api/campaigns/:campaignId/maps/:id
 * Update a map
 * Requires: DM role
 */
router.put(
  "/:id",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id } = req.params;
      const updateResult = await mapCoreCommands.dispatch<
        UpdateMapCommand,
        Awaited<ReturnType<UpdateMap["execute"]>>
      >({
        type: UPDATE_MAP,
        campaignId,
        mapId: id,
        input: req.body as Record<string, unknown>,
      });
      let updatedMap = updateResult.map;

      // The generic map editor delegates this field to the same scene command
      // used by the dedicated /lighting endpoint. Persist before broadcasting.
      if (updateResult.lightingEnabled !== undefined) {
        const lightingEnabled = await sceneCommands.dispatch<
          SetSceneLightingEnabledCommand,
          boolean
        >({
          type: SET_SCENE_LIGHTING_ENABLED,
          actor: sceneActor(campaignId),
          mapId: id,
          enabled: updateResult.lightingEnabled,
        });
        updatedMap = { ...updatedMap, lightingEnabled };
        try {
          productionCampaignEvents.publish(campaignId, "map:lighting:updated", {
            mapId: id,
            lightingEnabled,
          });
        } catch {
          /* non-fatal */
        }
      }

      return res.status(200).json({ map: updatedMap });
    } catch (error) {
      if (sendMapLifecycleError(res, error)) return;
      logger.error("Error updating map", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update map",
      });
    }
  },
);

/**
 * DELETE /api/campaigns/:campaignId/maps/:id
 * Delete a map
 * Requires: DM role
 * Cannot delete if it's the current map
 */
router.delete(
  "/:id",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id } = req.params;
      await mapCoreCommands.dispatch<DeleteMapCommand, void>({
        type: DELETE_MAP,
        campaignId,
        mapId: id,
      });
      return res.status(200).json({
        message: "Map deleted successfully",
      });
    } catch (error) {
      if (sendMapLifecycleError(res, error)) return;
      logger.error("Error deleting map", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to delete map",
      });
    }
  },
);

/**
 * PUT /api/campaigns/:campaignId/maps/:id/set-current
 * Set a map as the current map for the campaign
 * Requires: DM role
 */
router.put(
  "/:id/set-current",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id } = req.params;
      const updatedCampaign = await mapCoreCommands.dispatch<
        SetCurrentMapCommand,
        Awaited<ReturnType<SetCurrentMap["execute"]>>
      >({
        type: SET_CURRENT_MAP,
        campaignId,
        mapId: id,
      });
      return res.status(200).json({
        message: "Current map updated successfully",
        campaign: updatedCampaign,
      });
    } catch (error) {
      if (sendMapLifecycleError(res, error)) return;
      logger.error("Error setting current map", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to set current map",
      });
    }
  },
);

// ============================================
// TOKEN MANIPULATION ENDPOINTS
// ============================================

/**
 * POST /api/campaigns/:campaignId/maps/:id/tokens
 * Add a new token to the map
 * Requires: DM role
 *
 * Token Schema:
 * {
 *   id: string (UUID),
 *   characterId?: string,
 *   name: string,
 *   imageUrl: string,
 *   position: { x: number, y: number },
 *   size: { width: number, height: number },
 *   layer: "token" | "spirit",
 *   visible: boolean,
 *   controlledBy?: string,
 *   rotation: number,
 *   conditions: string[],
 *   metadata: object
 * }
 */
router.post(
  "/:id/tokens",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id: mapId } = req.params;
      const tokenData = req.body;

      const result = await mapTokenCommands.dispatch<
        CreateMapTokenCommand,
        MapTokenMutationResult
      >({
        type: CREATE_MAP_TOKEN,
        campaignId,
        mapId,
        data: tokenData,
      });
      return res.status(201).json({
        message: "Token added successfully",
        token: result.token,
        map: result.map,
      });
    } catch (error) {
      if (sendMapLifecycleError(res, error)) return;
      if (error instanceof MapTokenError) {
        return res
          .status(error.status)
          .json({ error: error.error, message: error.message });
      }
      logger.error("Error adding token", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to add token",
      });
    }
  },
);

/**
 * PUT /api/campaigns/:campaignId/maps/:id/tokens/:tokenId
 * Update an existing token on the map
 * Requires: DM role OR player controlling the token
 *
 * DM can update any token
 * Players can only update tokens where controlledBy matches their userId
 */
router.put(
  "/:id/tokens/:tokenId",
  campaignMember,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id: mapId, tokenId } = req.params;
      const userId = req.session.userId!;
      const updates = req.body;

      const result = await mapTokenCommands.dispatch<
        UpdateMapTokenCommand,
        MapTokenMutationResult
      >({
        type: UPDATE_MAP_TOKEN,
        campaignId,
        mapId,
        tokenId,
        userId,
        updates,
      });
      return res.status(200).json({
        message: "Token updated successfully",
        token: result.token,
        map: result.map,
      });
    } catch (error) {
      if (sendMapLifecycleError(res, error)) return;
      if (error instanceof MapTokenError) {
        return res
          .status(error.status)
          .json({ error: error.error, message: error.message });
      }
      logger.error("Error updating token", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update token",
      });
    }
  },
);

/**
 * DELETE /api/campaigns/:campaignId/maps/:id/tokens/:tokenId
 * Remove a token from the map
 * Requires: DM role
 */
router.delete(
  "/:id/tokens/:tokenId",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id: mapId, tokenId } = req.params;

      await mapTokenCommands.dispatch<DeleteMapTokenCommand, void>({
        type: DELETE_MAP_TOKEN,
        campaignId,
        mapId,
        tokenId,
      });
      return res.status(200).json({ message: "Token removed successfully" });
    } catch (error) {
      if (sendMapLifecycleError(res, error)) return;
      if (error instanceof MapTokenError) {
        return res
          .status(error.status)
          .json({ error: error.error, message: error.message });
      }
      logger.error("Error removing token", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to remove token",
      });
    }
  },
);

// ============================================================
// WALL SEGMENT ENDPOINTS// All write endpoints require DM role.
// ============================================================

/**
 * Helper: verify map belongs to campaign and return it, or send error response.
 * Returns null if a response was already sent.
 */
async function findMapInCampaign(
  campaignId: string,
  mapId: string,
  res: Response,
) {
  const map = await productionRealtimeQueries.mapForCampaign(campaignId, mapId);
  if (!map) {
    res.status(404).json({
      error: "Not Found",
      message: "Map not found in this campaign",
    });
    return null;
  }
  return map;
}

/**
 * GET /api/campaigns/:campaignId/maps/:id/walls
 * Return the map's wall segments array (all roles).
 */
router.get(
  "/:id/walls",
  campaignMember,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id } = req.params;
      const map = await findMapInCampaign(campaignId, id, res);
      if (!map) return;
      const segments = (Array.isArray(map.wallSegments)
        ? map.wallSegments
        : []) as unknown as WallSegment[];
      return res.status(200).json({ segments });
    } catch (error) {
      logger.error("Error fetching wall segments", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch wall segments",
      });
    }
  },
);

/**
 * PUT /api/campaigns/:campaignId/maps/:id/walls
 * Replace the entire wall segments array (DM only).
 * Body: { segments: WallSegment[] }
 */
router.put(
  "/:id/walls",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id } = req.params;
      const map = await findMapInCampaign(campaignId, id, res);
      if (!map) return;

      const parsed = WallSegmentsArraySchema.safeParse(req.body.segments);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation Error",
          message: parsed.error.issues[0]?.message ?? "Invalid segments",
        });
      }

      const segments = await sceneCommands.dispatch<
        ReplaceWallSegmentsCommand,
        WallSegment[]
      >({
        type: REPLACE_WALL_SEGMENTS,
        actor: sceneActor(campaignId),
        mapId: id,
        segments: parsed.data,
      });

      return res.status(200).json({ segments });
    } catch (error) {
      if (sendMapLifecycleError(res, error)) return;
      logger.error("Error replacing wall segments", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update wall segments",
      });
    }
  },
);

/**
 * POST /api/campaigns/:campaignId/maps/:id/walls
 * Add a single wall segment (DM only).
 * Body: WallSegment (id generated server-side if missing)
 */
router.post(
  "/:id/walls",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id } = req.params;
      const map = await findMapInCampaign(campaignId, id, res);
      if (!map) return;

      const segmentData = { ...req.body, id: req.body.id || randomUUID() };
      const parsed = WallSegmentSchema.safeParse(segmentData);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation Error",
          message: parsed.error.issues[0]?.message ?? "Invalid segment",
        });
      }

      const existing = (Array.isArray(map.wallSegments)
        ? map.wallSegments
        : []) as unknown as WallSegment[];
      if (existing.length >= 5000) {
        return res.status(400).json({
          error: "Limit Exceeded",
          message: "Maximum 5000 wall segments per map",
        });
      }

      const segments = await sceneCommands.dispatch<
        AddWallSegmentCommand,
        WallSegment[]
      >({
        type: ADD_WALL_SEGMENT,
        actor: sceneActor(campaignId),
        mapId: id,
        segment: parsed.data,
      });

      return res
        .status(201)
        .json({ segment: parsed.data, total: segments.length });
    } catch (error) {
      if (sendMapLifecycleError(res, error)) return;
      logger.error("Error adding wall segment", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to add wall segment",
      });
    }
  },
);

/**
 * DELETE /api/campaigns/:campaignId/maps/:id/walls/:sid
 * Remove a wall segment by id (DM only).
 */
router.delete(
  "/:id/walls/:sid",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id, sid } = req.params;
      const map = await findMapInCampaign(campaignId, id, res);
      if (!map) return;

      const existing = (Array.isArray(map.wallSegments)
        ? map.wallSegments
        : []) as unknown as WallSegment[];
      const filtered = existing.filter((s) => s.id !== sid);

      if (filtered.length === existing.length) {
        return res
          .status(404)
          .json({ error: "Not Found", message: "Wall segment not found" });
      }

      await sceneCommands.dispatch<RemoveWallSegmentCommand, WallSegment[]>({
        type: REMOVE_WALL_SEGMENT,
        actor: sceneActor(campaignId),
        mapId: id,
        segmentId: sid,
      });
      return res.status(200).json({ message: "Wall segment deleted" });
    } catch (error) {
      if (sendMapLifecycleError(res, error)) return;
      logger.error("Error deleting wall segment", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to delete wall segment",
      });
    }
  },
);

/**
 * PATCH /api/campaigns/:campaignId/maps/:id/walls/:sid
 * Update a wall type. DMs may edit walls; players may toggle unlocked doors.
 * Body: { type: WallType }
 */
router.patch(
  "/:id/walls/:sid",
  campaignMember,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id, sid } = req.params;
      const map = await findMapInCampaign(campaignId, id, res);
      if (!map) return;

      const validTypes = [
        "wall",
        "door-closed",
        "door-open",
        "door-locked",
        "window",
      ];
      if (!req.body.type || !validTypes.includes(req.body.type)) {
        return res.status(400).json({
          error: "Validation Error",
          message: `type must be one of: ${validTypes.join(", ")}`,
        });
      }

      const existing = (Array.isArray(map.wallSegments)
        ? map.wallSegments
        : []) as unknown as WallSegment[];
      const segIndex = existing.findIndex((s) => s.id === sid);

      if (segIndex === -1) {
        return res
          .status(404)
          .json({ error: "Not Found", message: "Wall segment not found" });
      }

      const segment = {
        ...existing[segIndex],
        type: req.body.type,
      } as WallSegment;
      await sceneCommands.dispatch<UpdateWallSegmentCommand, WallSegment[]>({
        type: UPDATE_WALL_SEGMENT,
        actor: sceneActor(campaignId, req),
        mapId: id,
        segment,
      });

      return res.status(200).json({ segment });
    } catch (error) {
      if (sendMapLifecycleError(res, error)) return;
      logger.error("Error updating wall segment", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update wall segment",
      });
    }
  },
);

// ============================================================
// LIGHT SOURCE ENDPOINTS
// ============================================================

/**
 * GET /api/campaigns/:campaignId/maps/:id/lights
 * Return the map's light sources array (all campaign members).
 */
router.get(
  "/:id/lights",
  campaignMember,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id } = req.params;
      const map = await findMapInCampaign(campaignId, id, res);
      if (!map) return;
      const lights = (Array.isArray(map.lights)
        ? map.lights
        : []) as unknown as LightSource[];
      return res.status(200).json({ lights });
    } catch (error) {
      logger.error("Error fetching light sources:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch light sources",
      });
    }
  },
);

/**
 * PUT /api/campaigns/:campaignId/maps/:id/lights
 * Replace the entire light sources array (DM only).
 * Body: { lights: LightSource[] }
 */
router.put(
  "/:id/lights",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id } = req.params;
      const map = await findMapInCampaign(campaignId, id, res);
      if (!map) return;

      const parsed = LightSourcesArraySchema.safeParse(req.body.lights);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation Error",
          message: parsed.error.issues[0]?.message ?? "Invalid lights array",
        });
      }

      const lights = await sceneCommands.dispatch<
        ReplaceLightSourcesCommand,
        LightSource[]
      >({
        type: REPLACE_LIGHT_SOURCES,
        actor: sceneActor(campaignId),
        mapId: id,
        lights: parsed.data,
      });

      productionCampaignEvents.publish(campaignId, "lights:replaced", { mapId: id, lights });
      return res.status(200).json({ lights });
    } catch (error) {
      if (sendMapLifecycleError(res, error)) return;
      logger.error("Error replacing light sources:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update light sources",
      });
    }
  },
);

/**
 * POST /api/campaigns/:campaignId/maps/:id/lights
 * Add a single light source (DM only).
 * Body: LightSource (id generated server-side if missing)
 */
router.post(
  "/:id/lights",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id } = req.params;
      const map = await findMapInCampaign(campaignId, id, res);
      if (!map) return;

      const lightData = { ...req.body, id: req.body.id || randomUUID() };
      const parsed = LightSourceSchema.safeParse(lightData);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation Error",
          message: parsed.error.issues[0]?.message ?? "Invalid light source",
        });
      }

      const existing = (Array.isArray(map.lights)
        ? map.lights
        : []) as unknown as LightSource[];
      if (existing.length >= 200) {
        return res.status(400).json({
          error: "Limit Exceeded",
          message: "Maximum 200 light sources per map",
        });
      }

      const lights = await sceneCommands.dispatch<
        AddLightSourceCommand,
        LightSource[]
      >({
        type: ADD_LIGHT_SOURCE,
        actor: sceneActor(campaignId),
        mapId: id,
        light: parsed.data,
      });

      productionCampaignEvents.publish(campaignId, "light:added", {
        mapId: id,
        light: parsed.data,
      });
      return res.status(201).json({ light: parsed.data, total: lights.length });
    } catch (error) {
      if (sendMapLifecycleError(res, error)) return;
      logger.error("Error adding light source:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to add light source",
      });
    }
  },
);

/**
 * PATCH /api/campaigns/:campaignId/maps/:id/lights/:lightId
 * Update a single light source (DM only).
 * Body: Partial<LightSource> (at least one field required)
 */
router.patch(
  "/:id/lights/:lightId",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id, lightId } = req.params;
      const map = await findMapInCampaign(campaignId, id, res);
      if (!map) return;

      const parsed = LightSourceUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation Error",
          message: parsed.error.issues[0]?.message ?? "Invalid update data",
        });
      }

      const existing = (Array.isArray(map.lights)
        ? map.lights
        : []) as unknown as LightSource[];
      const idx = existing.findIndex((l) => l.id === lightId);
      if (idx === -1) {
        return res
          .status(404)
          .json({ error: "Not Found", message: "Light source not found" });
      }

      const light = { ...existing[idx], ...parsed.data } as LightSource;
      await sceneCommands.dispatch<UpdateLightSourceCommand, LightSource[]>({
        type: UPDATE_LIGHT_SOURCE,
        actor: sceneActor(campaignId),
        mapId: id,
        light,
      });

      productionCampaignEvents.publish(campaignId, "light:updated", { mapId: id, light });
      return res.status(200).json({ light });
    } catch (error) {
      if (sendMapLifecycleError(res, error)) return;
      logger.error("Error updating light source:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update light source",
      });
    }
  },
);

/**
 * DELETE /api/campaigns/:campaignId/maps/:id/lights/:lightId
 * Remove a light source by id (DM only).
 */
router.delete(
  "/:id/lights/:lightId",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id, lightId } = req.params;
      const map = await findMapInCampaign(campaignId, id, res);
      if (!map) return;

      const existing = (Array.isArray(map.lights)
        ? map.lights
        : []) as unknown as LightSource[];
      const filtered = existing.filter((l) => l.id !== lightId);

      if (filtered.length === existing.length) {
        return res
          .status(404)
          .json({ error: "Not Found", message: "Light source not found" });
      }

      await sceneCommands.dispatch<RemoveLightSourceCommand, LightSource[]>({
        type: REMOVE_LIGHT_SOURCE,
        actor: sceneActor(campaignId),
        mapId: id,
        lightId,
      });

      productionCampaignEvents.publish(campaignId, "light:removed", { mapId: id, lightId });
      return res.status(200).json({ message: "Light source deleted" });
    } catch (error) {
      if (sendMapLifecycleError(res, error)) return;
      logger.error("Error deleting light source:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to delete light source",
      });
    }
  },
);

// ============================================================
// FOG OF WAR ENDPOINTS// ============================================================

/**
 * GET /api/campaigns/:campaignId/maps/:id/fog
 * Return full FogState for this map (DM only).
 */
router.get(
  "/:id/fog",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id } = req.params;
      const map = await findMapInCampaign(campaignId, id, res);
      if (!map) return;

      const fog = loadFogState(map, map.fogData as FogState | null);
      return res.status(200).json({ fogState: fog });
    } catch (error) {
      logger.error("Error fetching fog state", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch fog state",
      });
    }
  },
);

/**
 * POST /api/campaigns/:campaignId/maps/:id/fog/operation
 * Apply a FogOperation to the fog state (DM only).
 * Body: FogOperation
 * Returns the updated FogState.
 */
router.post(
  "/:id/fog/operation",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id } = req.params;
      const map = await findMapInCampaign(campaignId, id, res);
      if (!map) return;

      const parsed = FogOperationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation Error",
          message: parsed.error.issues[0]?.message ?? "Invalid fog operation",
        });
      }

      const fog = await sceneCommands.dispatch<
        ApplyFogOperationCommand,
        FogState
      >({
        type: APPLY_FOG_OPERATION,
        actor: sceneActor(campaignId),
        mapId: id,
        operation: parsed.data,
      });

      return res.status(200).json({ fogState: fog });
    } catch (error) {
      if (sendMapLifecycleError(res, error)) return;
      logger.error("Error applying fog operation", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to apply fog operation",
      });
    }
  },
);

/**
 * PUT /api/campaigns/:campaignId/maps/:id/lighting
 * Toggle dynamic lighting enabled/disabled (DM only).
 * Body: { enabled: boolean }
 */
router.put(
  "/:id/lighting",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id } = req.params;
      const map = await findMapInCampaign(campaignId, id, res);
      if (!map) return;

      if (typeof req.body.enabled !== "boolean") {
        return res.status(400).json({
          error: "Validation Error",
          message: "enabled must be a boolean",
        });
      }

      const lightingEnabled = await sceneCommands.dispatch<
        SetSceneLightingEnabledCommand,
        boolean
      >({
        type: SET_SCENE_LIGHTING_ENABLED,
        actor: sceneActor(campaignId),
        mapId: id,
        enabled: req.body.enabled,
      });

      // Broadcast to all clients in this campaign so they don't need to reload
      try {
        productionCampaignEvents.publish(campaignId, "map:lighting:updated", {
          mapId: id,
          lightingEnabled,
        });
      } catch {
        // Socket may not be initialized in tests — log and continue
      }

      return res.status(200).json({ lightingEnabled });
    } catch (error) {
      if (sendMapLifecycleError(res, error)) return;
      logger.error("Error updating lighting setting", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update lighting setting",
      });
    }
  },
);

export default router;
