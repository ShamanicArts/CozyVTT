import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/rbac';
import { authenticated } from '../middleware/compose';
import { prisma } from '../config/database';
import { GameSystem } from '../game-systems';
import { validateCharacterData } from '../validators/game-systems';
import logger from '../utils/logger';
import { CommandBus } from '../application/commands/CommandBus';
import {
  ASSIGN_CHARACTER,
  AssignCharacter,
  AssignCharacterCommand,
  CharacterMutationResult,
  COPY_CHARACTER,
  CopyCharacter,
  CopyCharacterCommand,
  CREATE_CHARACTER,
  CreateCharacter,
  CreateCharacterCommand,
  DELETE_CHARACTER,
  DeleteCharacter,
  DeleteCharacterCommand,
  UPDATE_CHARACTER,
  UpdateCharacter,
  UpdateCharacterCommand,
} from '../application/characters/CharacterMutations';
import { CharacterError } from '../domain/characters/Character';
import { PrismaCharacterRepository } from '../adapters/persistence/PrismaCharacterRepository';
import { LegacyCharacterAssetUrlNormalizer } from '../adapters/assets/LegacyCharacterAssetUrlNormalizer';
import { WebsocketCharacterEventPublisher } from '../adapters/events/WebsocketCharacterEventPublisher';

const router = Router();

const characterCommands = new CommandBus();
const characterRepository = new PrismaCharacterRepository(prisma);
const characterAssetUrls = new LegacyCharacterAssetUrlNormalizer();
const characterEvents = new WebsocketCharacterEventPublisher();
characterCommands.register(CREATE_CHARACTER, new CreateCharacter(characterRepository, characterAssetUrls, characterEvents));
characterCommands.register(UPDATE_CHARACTER, new UpdateCharacter(characterRepository, characterAssetUrls, characterEvents));
characterCommands.register(DELETE_CHARACTER, new DeleteCharacter(characterRepository, characterAssetUrls, characterEvents));
characterCommands.register(ASSIGN_CHARACTER, new AssignCharacter(characterRepository, characterAssetUrls, characterEvents));
characterCommands.register(COPY_CHARACTER, new CopyCharacter(characterRepository, characterAssetUrls, characterEvents));

function sendCharacterError(res: Response, error: unknown): boolean {
  if (!(error instanceof CharacterError)) return false;
  res.status(error.status).json({
    error: error.error,
    message: error.message,
    ...(error.validationErrors ? { validationErrors: error.validationErrors } : {}),
  });
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
router.post('/', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;

    const result = await characterCommands.dispatch<CreateCharacterCommand, CharacterMutationResult>({
      type: CREATE_CHARACTER,
      userId,
      input: req.body,
    });
    return res.status(201).json({ message: 'Character created successfully', character: result.character });
  } catch (error) {
    if (sendCharacterError(res, error)) return;
    logger.error('Error creating character', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create character',
    });
  }
});

/**
 * GET /api/characters
 * List all characters owned by the authenticated user
 * Requires: Authentication
 */
router.get('/', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;

    const characters = await prisma.character.findMany({
      where: { userId },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.status(200).json({ characters });
  } catch (error) {
    logger.error('Error fetching characters', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch characters',
    });
  }
});

/**
 * GET /api/characters/templates/:gameSystem/:templateName
 * Get a specific character template for a game system
 * Requires: Authentication
 * NOTE: This route MUST come before GET /:id to avoid route conflicts
 */
router.get(
  '/templates/:gameSystem/:templateName',
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { gameSystem, templateName } = req.params;

      // Handle flexible templates (no game system)
      if (!gameSystem || gameSystem === 'null' || gameSystem === 'undefined') {
        const { FLEXIBLE_TEMPLATES } = await import(
          '../utils/character-templates/flexible-templates'
        );
        const template = FLEXIBLE_TEMPLATES[templateName];

        if (!template) {
          return res.status(404).json({
            error: 'Template Not Found',
            message: `Template '${templateName}' not found for flexible characters`,
          });
        }

        return res.status(200).json({
          message: 'Template retrieved successfully',
          ...template,
        });
      }

      // Validate game system
      if (!Object.values(GameSystem).includes(gameSystem as GameSystem)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: `Invalid game system: ${gameSystem}`,
        });
      }

      // Import template functions
      const { getCharacterTemplate } = await import('../utils/character-templates');

      // Get the template
      const template = getCharacterTemplate(gameSystem as GameSystem, templateName);

      return res.status(200).json({
        message: 'Template retrieved successfully',
        ...template,
      });
    } catch (error) {
      logger.error('Error fetching character template', { err: error });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch character template',
      });
    }
  }
);

/**
 * GET /api/characters/:id
 * Get a specific character
 * Requires: Authentication
 * Authorization: Character owner OR campaign DM (if character is in a campaign)
 */
router.get('/:id', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { id } = req.params;

    const character = await prisma.character.findUnique({
      where: { id },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
          },
        },
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            // SECURITY: never embed `email` — this endpoint can be hit by
            // any campaign member viewing another player's character.
          },
        },
      },
    });

    if (!character) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Character not found',
      });
    }

    // Check authorization: owner can always view
    if (character.userId === userId) {
      return res.status(200).json({ character });
    }

    // If character is in a campaign, check if requester is a campaign member
    // All campaign members can VIEW characters, but only owner/DM can EDIT
    if (character.campaignId) {
      const membership = await prisma.campaignMembership.findUnique({
        where: {
          userId_campaignId: {
            userId,
            campaignId: character.campaignId,
          },
        },
      });

      // Any campaign member (DM, PLAYER, SPECTATOR) can view characters in the campaign
      if (membership) {
        return res.status(200).json({ character });
      }
    }

    // Not authorized
    return res.status(403).json({
      error: 'Forbidden',
      message: 'You do not have permission to view this character',
    });
  } catch (error) {
    logger.error('Error fetching character', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch character',
    });
  }
});

/**
 * GET /api/characters/:id/validate
 * Validate character data against game system schema
 * Requires: Authentication
 * Authorization: Character owner only
 */
router.get('/:id/validate', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { id } = req.params;

    const character = await prisma.character.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        gameSystem: true,
        data: true,
      },
    });

    if (!character) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Character not found',
      });
    }

    // Only character owner can validate (prevent info leakage)
    if (character.userId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to validate this character',
      });
    }

    // Cannot validate without a game system
    if (!character.gameSystem) {
      return res.status(400).json({
        isValid: false,
        errors: [{
          path: 'gameSystem',
          message: 'Character has no game system assigned',
          code: 'no_game_system',
        }],
      });
    }

    // Validate character data
    try {
      validateCharacterData(character.gameSystem as any, character.data);

      return res.status(200).json({
        isValid: true,
      });
    } catch (error: any) {
      // Validation failed - return detailed errors
      if (error.errors) {
        const formattedErrors = error.errors.map((err: any) => ({
          path: err.path.join('.') || 'root',
          message: err.message,
          code: err.code,
        }));

        return res.status(200).json({
          isValid: false,
          errors: formattedErrors,
        });
      }

      // Unknown validation error
      return res.status(200).json({
        isValid: false,
        errors: [{
          path: 'unknown',
          message: error.message || 'Unknown validation error',
          code: 'unknown',
        }],
      });
    }
  } catch (error) {
    logger.error('Error validating character', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate character',
    });
  }
});

/**
 * PUT /api/characters/:id
 * Update a character
 * Requires: Authentication
 * Authorization: Character owner OR campaign DM (if character is in a campaign)
 */
router.put('/:id', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { id } = req.params;

    const result = await characterCommands.dispatch<UpdateCharacterCommand, CharacterMutationResult>({
      type: UPDATE_CHARACTER,
      userId,
      characterId: id,
      input: req.body,
    });
    return res.status(200).json({ message: 'Character updated successfully', character: result.character });
  } catch (error) {
    if (sendCharacterError(res, error)) return;
    logger.error('Error updating character', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update character',
    });
  }
});

/**
 * DELETE /api/characters/:id
 * Delete a character
 * Requires: Authentication
 * Authorization: Character owner only
 */
router.delete('/:id', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { id } = req.params;

    await characterCommands.dispatch<DeleteCharacterCommand, void>({
      type: DELETE_CHARACTER,
      userId,
      characterId: id,
    });
    return res.status(200).json({ message: 'Character deleted successfully' });
  } catch (error) {
    if (sendCharacterError(res, error)) return;
    logger.error('Error deleting character', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete character',
    });
  }
});

/**
 * POST /api/characters/:id/assign
 * Assign a character to a campaign (or unassign if campaignId is null/empty)
 * Requires: Authentication
 * Authorization: Character owner only
 * Validation: User must be a member of the target campaign (if assigning)
 */
router.post('/:id/assign', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { id } = req.params;
    const { campaignId } = req.body;

    const result = await characterCommands.dispatch<AssignCharacterCommand, CharacterMutationResult>({
      type: ASSIGN_CHARACTER,
      userId,
      characterId: id,
      campaignId,
    });
    const wasUnassigned = !campaignId || campaignId === '';
    return res.status(200).json({
      message: wasUnassigned ? 'Character unassigned from campaign successfully' : 'Character assigned to campaign successfully',
      character: result.character,
    });
  } catch (error) {
    if (sendCharacterError(res, error)) return;
    logger.error('Error assigning character to campaign', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to assign character to campaign',
    });
  }
});

/**
 * POST /api/characters/:id/copy
 * Create a copy of an existing character
 * Requires: Authentication
 * Authorization: Character owner only
 */
router.post('/:id/copy', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { id } = req.params;

    const result = await characterCommands.dispatch<CopyCharacterCommand, CharacterMutationResult>({
      type: COPY_CHARACTER,
      userId,
      characterId: id,
    });
    return res.status(201).json({ message: 'Character copied successfully', character: result.character });
  } catch (error) {
    if (sendCharacterError(res, error)) return;
    logger.error('Error copying character', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to copy character',
    });
  }
});

export default router;
