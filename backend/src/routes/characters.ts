import { Router, Response } from "express";
import { AuthenticatedRequest } from "../middleware/rbac";
import { authenticated } from "../middleware/compose";
import logger from "../utils/logger";
import { productionTransportCommands } from "../composition/productionTransportCommands";
import {
  ASSIGN_CHARACTER,
  AssignCharacterCommand,
  CharacterMutationResult,
  COPY_CHARACTER,
  CopyCharacterCommand,
  CREATE_CHARACTER,
  CreateCharacterCommand,
  DELETE_CHARACTER,
  DeleteCharacterCommand,
  UPDATE_CHARACTER,
  UpdateCharacterCommand,
} from "../application/characters/CharacterMutations";
import { CharacterError } from "../domain/characters/Character";
import { CharacterQueryError } from "../application/characters/CharacterQueries";
import { productionCharacterQueries } from "../composition/productionCharacterQueries";

const router = Router();

const characterCommands = productionTransportCommands;

function sendCharacterError(res: Response, error: unknown): boolean {
  if (!(error instanceof CharacterError)) return false;
  res.status(error.status).json({
    error: error.error,
    message: error.message,
    ...(error.validationErrors
      ? { validationErrors: error.validationErrors }
      : {}),
  });
  return true;
}

function sendCharacterQueryError(res: Response, error: unknown): boolean {
  if (!(error instanceof CharacterQueryError)) return false;
  res.status(error.status).json({ error: error.error, message: error.message });
  return true;
}

/**
 * Character Management Routes
 * Character Management
 */

/**
 * POST /api/characters
 * Create a new character
 * Requires: Authentication
 */
router.post(
  "/",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.session.userId!;

      const result = await characterCommands.dispatch<
        CreateCharacterCommand,
        CharacterMutationResult
      >({
        type: CREATE_CHARACTER,
        userId,
        input: req.body,
      });
      return res
        .status(201)
        .json({
          message: "Character created successfully",
          character: result.character,
        });
    } catch (error) {
      if (sendCharacterError(res, error)) return;
      logger.error("Error creating character", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to create character",
      });
    }
  },
);

/**
 * GET /api/characters
 * List all characters owned by the authenticated user
 * Requires: Authentication
 */
router.get(
  "/",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.session.userId!;

      const characters = await productionCharacterQueries.ownedBy(userId);

      return res.status(200).json({ characters });
    } catch (error) {
      logger.error("Error fetching characters", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch characters",
      });
    }
  },
);

/**
 * GET /api/characters/templates/:gameSystem/:templateName
 * Get a specific character template for a game system
 * Requires: Authentication
 * NOTE: This route MUST come before GET /:id to avoid route conflicts
 */
router.get(
  "/templates/:gameSystem/:templateName",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { gameSystem, templateName } = req.params;

      const template = productionCharacterQueries.template(
        gameSystem,
        templateName,
      );

      return res.status(200).json({
        message: "Template retrieved successfully",
        ...template,
      });
    } catch (error) {
      if (sendCharacterQueryError(res, error)) return;
      logger.error("Error fetching character template", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch character template",
      });
    }
  },
);

/**
 * GET /api/characters/:id
 * Get a specific character
 * Requires: Authentication
 * Authorization: Character owner OR campaign DM (if character is in a campaign)
 */
router.get(
  "/:id",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { id } = req.params;

      const character = await productionCharacterQueries.visibleTo(userId, id);
      return res.status(200).json({ character });
    } catch (error) {
      if (sendCharacterQueryError(res, error)) return;
      logger.error("Error fetching character", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch character",
      });
    }
  },
);

/**
 * GET /api/characters/:id/validate
 * Validate character data against game system schema
 * Requires: Authentication
 * Authorization: Character owner only
 */
router.get(
  "/:id/validate",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { id } = req.params;

      const result = await productionCharacterQueries.validate(userId, id);
      return res.status(result.errors?.[0]?.code === "no_game_system" ? 400 : 200).json(result);
    } catch (error) {
      if (sendCharacterQueryError(res, error)) return;
      logger.error("Error validating character", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to validate character",
      });
    }
  },
);

/**
 * PUT /api/characters/:id
 * Update a character
 * Requires: Authentication
 * Authorization: Character owner OR campaign DM (if character is in a campaign)
 */
router.put(
  "/:id",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { id } = req.params;

      const result = await characterCommands.dispatch<
        UpdateCharacterCommand,
        CharacterMutationResult
      >({
        type: UPDATE_CHARACTER,
        userId,
        characterId: id,
        input: req.body,
      });
      return res
        .status(200)
        .json({
          message: "Character updated successfully",
          character: result.character,
        });
    } catch (error) {
      if (sendCharacterError(res, error)) return;
      logger.error("Error updating character", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update character",
      });
    }
  },
);

/**
 * DELETE /api/characters/:id
 * Delete a character
 * Requires: Authentication
 * Authorization: Character owner only
 */
router.delete(
  "/:id",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { id } = req.params;

      await characterCommands.dispatch<DeleteCharacterCommand, void>({
        type: DELETE_CHARACTER,
        userId,
        characterId: id,
      });
      return res
        .status(200)
        .json({ message: "Character deleted successfully" });
    } catch (error) {
      if (sendCharacterError(res, error)) return;
      logger.error("Error deleting character", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to delete character",
      });
    }
  },
);

/**
 * POST /api/characters/:id/assign
 * Assign a character to a campaign (or unassign if campaignId is null/empty)
 * Requires: Authentication
 * Authorization: Character owner only
 * Validation: User must be a member of the target campaign (if assigning)
 */
router.post(
  "/:id/assign",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { id } = req.params;
      const { campaignId } = req.body;

      const result = await characterCommands.dispatch<
        AssignCharacterCommand,
        CharacterMutationResult
      >({
        type: ASSIGN_CHARACTER,
        userId,
        characterId: id,
        campaignId,
      });
      const wasUnassigned = !campaignId || campaignId === "";
      return res.status(200).json({
        message: wasUnassigned
          ? "Character unassigned from campaign successfully"
          : "Character assigned to campaign successfully",
        character: result.character,
      });
    } catch (error) {
      if (sendCharacterError(res, error)) return;
      logger.error("Error assigning character to campaign", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to assign character to campaign",
      });
    }
  },
);

/**
 * POST /api/characters/:id/copy
 * Create a copy of an existing character
 * Requires: Authentication
 * Authorization: Character owner only
 */
router.post(
  "/:id/copy",
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { id } = req.params;

      const result = await characterCommands.dispatch<
        CopyCharacterCommand,
        CharacterMutationResult
      >({
        type: COPY_CHARACTER,
        userId,
        characterId: id,
      });
      return res
        .status(201)
        .json({
          message: "Character copied successfully",
          character: result.character,
        });
    } catch (error) {
      if (sendCharacterError(res, error)) return;
      logger.error("Error copying character", { err: error });
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to copy character",
      });
    }
  },
);

export default router;
