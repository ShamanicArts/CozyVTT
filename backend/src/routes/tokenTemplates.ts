/**
 * Token Template API Routes
 * CRUD endpoints for reusable token templates (objects, pre-configured NPCs, etc.).
 * Mounted under /api/campaigns/:campaignId/token-templates
 */

import { Router, Response } from "express";
import { AuthenticatedRequest } from "../middleware/rbac";
import { campaignMember, campaignDM } from "../middleware/compose";
import {
  CreateTokenTemplateSchema,
  CreateTokenTemplateInput,
  UpdateTokenTemplateSchema,
  SaveTokenAsTemplateSchema,
} from "../validators/tokenTemplates";
import logger from "../utils/logger";
import { productionTransportCommands } from "../composition/productionTransportCommands";
import {
  CREATE_TOKEN_TEMPLATE,
  CreateTokenTemplate,
  CreateTokenTemplateCommand,
  CreateTokenTemplateData,
} from "../application/tokenTemplates/CreateTokenTemplate";
import { JsonValue } from "../domain/tokenTemplates/TokenTemplate";
import {
  COPY_TOKEN_TEMPLATE,
  CopyTokenTemplateCommand,
  DELETE_TOKEN_TEMPLATE,
  DeleteTokenTemplateCommand,
  SAVE_TOKEN_TEMPLATE,
  SaveTokenTemplateCommand,
  TokenTemplateMutationError,
  UPDATE_TOKEN_TEMPLATE,
  UpdateTokenTemplateCommand,
} from "../application/tokenTemplates/TokenTemplateMutations";
import {
  TokenTemplateQueryError,
} from "../application/tokenTemplates/TokenTemplateQueries";
import { productionTokenTemplateQueries } from "../composition/productionTokenTemplateQueries";

const router = Router({ mergeParams: true });

// HTTP is an adapter: validated request data is dispatched to an application
// command rather than coupling this endpoint directly to Prisma.
const tokenTemplateCommands = productionTransportCommands;
function tokenError(res: Response, error: unknown) {
  if (!(error instanceof TokenTemplateMutationError)) return false;
  res.status(error.status).json({ error: error.error, message: error.message });
  return true;
}

function toCreateTokenTemplateData(
  data: CreateTokenTemplateInput,
): CreateTokenTemplateData {
  return {
    name: data.name,
    imageUrl: data.imageUrl,
    type: data.type,
    disposition: data.disposition,
    displayMode: data.displayMode,
    size: data.size,
    notes: data.notes,
    hp: data.hp,
    showHpBar: data.showHpBar,
    statBlock: data.statBlock as JsonValue | null | undefined,
    sightRadius: data.sightRadius,
  };
}

// ============================================
// LIST — GET /
// Returns token templates for this campaign with search/pagination.
// Any campaign member can list.
// ============================================

router.get(
  "/",
  campaignMember,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId } = req.params;
      const { search, type, limit = "50", offset = "0" } = req.query;

      const take = Math.min(
        100,
        Math.max(1, parseInt(limit as string, 10) || 50),
      );
      const skip = Math.max(0, parseInt(offset as string, 10) || 0);

      const templateType =
        type &&
        typeof type === "string" &&
        ["player", "npc", "object"].includes(type)
          ? (type as "player" | "npc" | "object")
          : undefined;
      return res.json(
        await productionTokenTemplateQueries.list({
          campaignId,
          search: typeof search === "string" ? search : undefined,
          type: templateType,
          limit: take,
          offset: skip,
        }),
      );
    } catch (error) {
      logger.error("Error listing token templates:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to list token templates",
      });
    }
  },
);

// ============================================
// GET ONE — GET /:id
// ============================================

router.get(
  "/:id",
  campaignMember,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id } = req.params;

      return res.json(await productionTokenTemplateQueries.find(campaignId, id));
    } catch (error) {
      if (error instanceof TokenTemplateQueryError)
        return res
          .status(error.status)
          .json({ error: error.error, message: error.message });
      logger.error("Error getting token template:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to get token template",
      });
    }
  },
);

// ============================================
// CREATE — POST /
// DM only.
// ============================================

router.post(
  "/",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId } = req.params;
      const userId = req.session.userId!;

      const parsed = CreateTokenTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation Error",
          message: parsed.error.issues.map((i) => i.message).join("; "),
        });
      }

      const template = await tokenTemplateCommands.dispatch<
        CreateTokenTemplateCommand,
        Awaited<ReturnType<CreateTokenTemplate["execute"]>>
      >({
        type: CREATE_TOKEN_TEMPLATE,
        campaignId,
        createdById: userId,
        data: toCreateTokenTemplateData(parsed.data),
      });

      return res.status(201).json(template);
    } catch (error) {
      logger.error("Error creating token template:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to create token template",
      });
    }
  },
);

// ============================================
// UPDATE — PUT /:id
// DM only.
// ============================================

router.put(
  "/:id",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id } = req.params;

      const parsed = UpdateTokenTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation Error",
          message: parsed.error.issues.map((i) => i.message).join("; "),
        });
      }

      const updated = await tokenTemplateCommands.dispatch<
        UpdateTokenTemplateCommand,
        any
      >({
        type: UPDATE_TOKEN_TEMPLATE,
        campaignId,
        templateId: id,
        data: parsed.data as any,
      });

      return res.json(updated);
    } catch (error) {
      if (tokenError(res, error)) return;
      logger.error("Error updating token template:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update token template",
      });
    }
  },
);

// ============================================
// DELETE — DELETE /:id
// DM only.
// ============================================

router.delete(
  "/:id",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id } = req.params;

      await tokenTemplateCommands.dispatch<DeleteTokenTemplateCommand, void>({
        type: DELETE_TOKEN_TEMPLATE,
        campaignId,
        templateId: id,
      });
      return res.json({ message: "Token template deleted" });
    } catch (error) {
      if (tokenError(res, error)) return;
      logger.error("Error deleting token template:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to delete token template",
      });
    }
  },
);

// ============================================
// SAVE TOKEN AS TEMPLATE — POST /from-token
// DM only. Saves an existing map token's configuration as a reusable template.
// ============================================

router.post(
  "/from-token",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId } = req.params;
      const userId = req.session.userId!;

      const parsed = SaveTokenAsTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation Error",
          message: parsed.error.issues.map((i) => i.message).join("; "),
        });
      }

      const data = parsed.data;
      const template = await tokenTemplateCommands.dispatch<
        SaveTokenTemplateCommand,
        any
      >({
        type: SAVE_TOKEN_TEMPLATE,
        campaignId,
        userId,
        data: {
          ...data,
          imageUrl: data.imageUrl ?? null,
          disposition: data.disposition ?? null,
          notes: data.notes ?? null,
          hp: data.hp ?? null,
          statBlock: data.statBlock ?? null,
          sightRadius: data.sightRadius ?? null,
        } as any,
      });

      return res.status(201).json(template);
    } catch (error) {
      logger.error("Error saving token as template:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to save token as template",
      });
    }
  },
);

// ============================================
// COPY TO CAMPAIGN — POST /:id/copy-to/:targetCampaignId
// DM only (must be DM in BOTH source and target campaigns).
// Duplicates template into another campaign as an independent copy.
// ============================================

router.post(
  "/:id/copy-to/:targetCampaignId",
  campaignDM,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, id, targetCampaignId } = req.params;
      const userId = req.session.userId!;

      const copy = await tokenTemplateCommands.dispatch<
        CopyTokenTemplateCommand,
        any
      >({
        type: COPY_TOKEN_TEMPLATE,
        campaignId,
        templateId: id,
        userId,
        targetCampaignId,
      });

      return res.status(201).json(copy);
    } catch (error) {
      if (tokenError(res, error)) return;
      logger.error("Error copying token template:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to copy token template",
      });
    }
  },
);

export default router;
