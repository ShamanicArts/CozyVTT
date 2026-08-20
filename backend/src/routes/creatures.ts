/**
 * Creature Library API Routes
 * CRUD endpoints for creature templates — both SRD (global) and campaign-specific homebrew.
 * Mounted under /api/campaigns/:campaignId/creatures
 */

import { Router, Response } from "express";
import { AuthenticatedRequest } from "../middleware/rbac";
import { campaignMember, campaignDM } from "../middleware/compose";
import { prisma } from "../config/database";
import { getSrdSeedStatus } from "../services/creatureSeed";
import logger from "../utils/logger";
import { productionCommandBus } from "../composition/productionApplicationHost";
import {
  CREATE_CREATURE,
  UPDATE_CREATURE,
  DELETE_CREATURE,
  DUPLICATE_CREATURE,
  TOGGLE_CREATURE_FAVORITE,
  SEED_SRD_CREATURES,
  CreatureError,
} from "../application/creatures/CreatureMutations";

const router = Router({ mergeParams: true });
const creatureCommands = productionCommandBus;
function creatureError(res: Response, e: unknown) {
  if (!(e instanceof CreatureError)) return false;
  res.status(e.status).json({ error: e.error, message: e.message });
  return true;
}

/** Track whether a seed is currently in progress to prevent duplicate runs. */
let seedInProgress = false;

// ============================================
// SEED STATUS — GET /seed/status
// Returns whether SRD creatures have been seeded.
// Any campaign member can check.
// ============================================

router.get(
  "/seed/status",
  campaignMember,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const status = await getSrdSeedStatus(prisma);
      return res.json({
        ...status,
        seedInProgress,
      });
    } catch (error) {
      logger.error("Error checking seed status:", error);
      return res
        .status(500)
        .json({
          error: "Internal Server Error",
          message: "Failed to check seed status",
        });
    }
  },
);

// ============================================
// SEED SRD — POST /seed
// Fetches SRD creatures from Open5e and populates the library.
// DM only. Safe to call multiple times.
// ============================================

router.post(
  "/seed",
  campaignDM,
  async (_req: AuthenticatedRequest, res: Response) => {
    if (seedInProgress) {
      return res.status(409).json({
        error: "Conflict",
        message: "SRD seeding is already in progress. Please wait.",
      });
    }

    seedInProgress = true;
    try {
      const result: any = await creatureCommands.dispatch({
        type: SEED_SRD_CREATURES,
      });
      return res.json({
        message: "SRD creature seeding complete",
        ...result,
      });
    } catch (error) {
      logger.error("Error seeding SRD creatures:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message:
          "Failed to seed SRD creatures. Check that the server can reach api.open5e.com.",
      });
    } finally {
      seedInProgress = false;
    }
  },
);

// ============================================
// LIST — GET /
// Returns SRD + campaign-specific templates, with search/filter support.
// Any campaign member can list.
// ============================================

router.get(
  "/",
  campaignMember,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId } = req.params;
      const {
        search,
        source,
        cr,
        gameSystem,
        limit = "50",
        offset = "0",
      } = req.query;

      const take = Math.min(
        100,
        Math.max(1, parseInt(limit as string, 10) || 50),
      );
      const skip = Math.max(0, parseInt(offset as string, 10) || 0);

      // Build where clause: include SRD (campaignId null) + this campaign's customs
      const where: Record<string, unknown> = {
        OR: [{ campaignId: null }, { campaignId }],
      };

      if (search) {
        where.name = { contains: search as string, mode: "insensitive" };
      }
      if (source) {
        where.source = source as string;
      }
      if (cr) {
        where.challengeRating = cr as string;
      }
      if (gameSystem) {
        where.gameSystem = gameSystem as string;
      }

      const [templates, total] = await Promise.all([
        prisma.creatureTemplate.findMany({
          where: where as any,
          orderBy: { name: "asc" },
          take,
          skip,
        }),
        prisma.creatureTemplate.count({ where: where as any }),
      ]);

      return res.json({
        creatures: templates,
        total,
        limit: take,
        offset: skip,
      });
    } catch (error) {
      logger.error("Error listing creature templates:", error);
      return res
        .status(500)
        .json({
          error: "Internal Server Error",
          message: "Failed to list creature templates",
        });
    }
  },
);

// ============================================
// GET ONE — GET /:creatureId
// ============================================

router.get(
  "/:creatureId",
  campaignMember,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { creatureId } = req.params;

      const template = await prisma.creatureTemplate.findUnique({
        where: { id: creatureId },
      });

      if (!template) {
        return res
          .status(404)
          .json({ error: "Not Found", message: "Creature template not found" });
      }

      return res.json(template);
    } catch (error) {
      logger.error("Error getting creature template:", error);
      return res
        .status(500)
        .json({
          error: "Internal Server Error",
          message: "Failed to get creature template",
        });
    }
  },
);

// ============================================
// CREATE — POST /
// DM only. Creates a campaign-specific custom creature.
// ============================================

router.post(
  "/",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId } = req.params;
      const userId = req.session.userId!;
      const data = req.body;

      // Validate required fields
      if (!data.name || typeof data.name !== "string") {
        return res
          .status(400)
          .json({
            error: "Validation Error",
            message: "Creature name is required",
          });
      }
      if (!data.statBlock || typeof data.statBlock !== "object") {
        return res
          .status(400)
          .json({
            error: "Validation Error",
            message: "Stat block is required",
          });
      }

      const template = await creatureCommands.dispatch({
        type: CREATE_CREATURE,
        campaignId,
        userId,
        data,
      });

      return res.status(201).json(template);
    } catch (error) {
      if (creatureError(res, error)) return;
      logger.error("Error creating creature template:", error);
      return res
        .status(500)
        .json({
          error: "Internal Server Error",
          message: "Failed to create creature template",
        });
    }
  },
);

// ============================================
// UPDATE — PUT /:creatureId
// DM only. Can only update campaign-specific creatures (not SRD).
// ============================================

router.put(
  "/:creatureId",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, creatureId } = req.params;
      const data = req.body;

      const existing = await prisma.creatureTemplate.findUnique({
        where: { id: creatureId },
      });

      if (!existing) {
        return res
          .status(404)
          .json({ error: "Not Found", message: "Creature template not found" });
      }

      // Prevent editing SRD creatures
      if (existing.source === "srd") {
        return res.status(403).json({
          error: "Forbidden",
          message:
            "Cannot edit SRD creatures. Duplicate it first to create a custom version.",
        });
      }

      // Prevent editing another campaign's creatures
      if (existing.campaignId !== campaignId) {
        return res
          .status(403)
          .json({
            error: "Forbidden",
            message: "Cannot edit creatures from another campaign",
          });
      }

      const updated = await creatureCommands.dispatch({
        type: UPDATE_CREATURE,
        campaignId,
        creatureId,
        data,
      });

      return res.json(updated);
    } catch (error) {
      if (creatureError(res, error)) return;
      logger.error("Error updating creature template:", error);
      return res
        .status(500)
        .json({
          error: "Internal Server Error",
          message: "Failed to update creature template",
        });
    }
  },
);

// ============================================
// DELETE — DELETE /:creatureId
// DM only. Cannot delete SRD creatures.
// ============================================

router.delete(
  "/:creatureId",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, creatureId } = req.params;

      const existing = await prisma.creatureTemplate.findUnique({
        where: { id: creatureId },
      });

      if (!existing) {
        return res
          .status(404)
          .json({ error: "Not Found", message: "Creature template not found" });
      }

      if (existing.source === "srd") {
        return res
          .status(403)
          .json({ error: "Forbidden", message: "Cannot delete SRD creatures" });
      }

      if (existing.campaignId !== campaignId) {
        return res
          .status(403)
          .json({
            error: "Forbidden",
            message: "Cannot delete creatures from another campaign",
          });
      }

      await creatureCommands.dispatch({
        type: DELETE_CREATURE,
        campaignId,
        creatureId,
      });

      return res.json({ message: "Creature template deleted" });
    } catch (error) {
      if (creatureError(res, error)) return;
      logger.error("Error deleting creature template:", error);
      return res
        .status(500)
        .json({
          error: "Internal Server Error",
          message: "Failed to delete creature template",
        });
    }
  },
);

// ============================================
// DUPLICATE — POST /:creatureId/duplicate
// DM only. Copies any creature (including SRD) into a campaign-specific custom creature.
// ============================================

router.post(
  "/:creatureId/duplicate",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, creatureId } = req.params;
      const userId = req.session.userId!;

      const source = await prisma.creatureTemplate.findUnique({
        where: { id: creatureId },
      });

      if (!source) {
        return res
          .status(404)
          .json({ error: "Not Found", message: "Creature template not found" });
      }

      const duplicate = await creatureCommands.dispatch({
        type: DUPLICATE_CREATURE,
        campaignId,
        creatureId,
        userId,
      });

      return res.status(201).json(duplicate);
    } catch (error) {
      if (creatureError(res, error)) return;
      logger.error("Error duplicating creature template:", error);
      return res
        .status(500)
        .json({
          error: "Internal Server Error",
          message: "Failed to duplicate creature template",
        });
    }
  },
);

// ============================================
// FAVORITES — GET /favorites
// Returns creature IDs that the current user has favorited in this campaign.
// ============================================

router.get(
  "/favorites/list",
  campaignMember,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId } = req.params;
      const userId = req.session.userId!;

      const favorites = await prisma.creatureFavorite.findMany({
        where: { campaignId, userId },
        include: { creature: true },
        orderBy: { creature: { name: "asc" } },
      });

      return res.json({
        favoriteIds: favorites.map((f) => f.creatureId),
        creatures: favorites.map((f) => f.creature),
      });
    } catch (error) {
      logger.error("Error listing creature favorites:", error);
      return res
        .status(500)
        .json({
          error: "Internal Server Error",
          message: "Failed to list favorites",
        });
    }
  },
);

// ============================================
// FAVORITE — POST /:creatureId/favorite
// Toggle favorite for the current user in this campaign.
// ============================================

router.post(
  "/:creatureId/favorite",
  campaignMember,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, creatureId } = req.params;
      const userId = req.session.userId!;

      const favorited = await creatureCommands.dispatch({
        type: TOGGLE_CREATURE_FAVORITE,
        campaignId,
        userId,
        creatureId,
      });
      return res.json({ favorited });
    } catch (error) {
      if (creatureError(res, error)) return;
      logger.error("Error toggling creature favorite:", error);
      return res
        .status(500)
        .json({
          error: "Internal Server Error",
          message: "Failed to toggle favorite",
        });
    }
  },
);

export default router;
