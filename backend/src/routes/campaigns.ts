import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { AuthenticatedRequest } from '../middleware/rbac';
import { authenticated, campaignMember, campaignDM, adminOnly } from '../middleware/compose';
import { prisma } from '../config/database';
import { captureGameState, restoreGameState, getNextSessionNumber, getLastSession } from '../services/sessionState';
import { sendSystemMessage, broadcastToUser, broadcastToCampaign } from '../websocket/utils';
import { isSmtpConfigured, sendCampaignInvitationEmail } from '../services/email';
import { exportCampaign } from '../services/campaignExporter';
import { previewCampaignImport, importCampaign } from '../services/campaignImporter';
import { CreateCampaignSchema } from '../validators/campaigns';
import logger from '../utils/logger';
import { PrismaCampaignAdministrationRepository } from '../adapters/persistence/PrismaCampaignAdministrationRepository';
import { CommandBus } from '../application/commands/CommandBus';
import {
  CHANGE_CAMPAIGN_MEMBER_ROLE,
  CREATE_CAMPAIGN,
  DELETE_CAMPAIGN,
  INVITE_TO_CAMPAIGN,
  REMOVE_CAMPAIGN_MEMBER,
  UPDATE_CAMPAIGN,
  UPDATE_CAMPAIGN_VIBE,
  ChangeCampaignMemberRole,
  ChangeCampaignMemberRoleCommand,
  CreateCampaign,
  CreateCampaignCommand,
  DeleteCampaign,
  DeleteCampaignCommand,
  InviteToCampaign,
  InviteToCampaignCommand,
  RemoveCampaignMember,
  RemoveCampaignMemberCommand,
  UpdateCampaign,
  UpdateCampaignCommand,
  UpdateCampaignVibe,
  UpdateCampaignVibeCommand,
  isCampaignCommandError,
} from '../application/campaigns/CampaignCommands';

const router = Router();

const campaignAdministrationRepository = new PrismaCampaignAdministrationRepository(prisma);
const campaignCommands = new CommandBus();
campaignCommands.register(CREATE_CAMPAIGN, new CreateCampaign(campaignAdministrationRepository));
campaignCommands.register(UPDATE_CAMPAIGN, new UpdateCampaign(campaignAdministrationRepository));
campaignCommands.register(UPDATE_CAMPAIGN_VIBE, new UpdateCampaignVibe(campaignAdministrationRepository));
campaignCommands.register(DELETE_CAMPAIGN, new DeleteCampaign(campaignAdministrationRepository));
campaignCommands.register(INVITE_TO_CAMPAIGN, new InviteToCampaign(campaignAdministrationRepository));
campaignCommands.register(REMOVE_CAMPAIGN_MEMBER, new RemoveCampaignMember(campaignAdministrationRepository));
campaignCommands.register(CHANGE_CAMPAIGN_MEMBER_ROLE, new ChangeCampaignMemberRole(campaignAdministrationRepository));

function sendCampaignCommandError(res: Response, error: unknown): boolean {
  if (!isCampaignCommandError(error)) return false;
  res.status(error.status).json(error.error ? { error: error.error, message: error.message } : { message: error.message });
  return true;
}

// ── Import file upload (memory storage — ZIP stays in buffer) ───────────────
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 524288000, files: 1 }, // 500 MB hard cap
  fileFilter: (_req, file, cb) => {
    // Accept .cozyvtt or .zip MIME types
    const allowed = [
      'application/zip',
      'application/x-zip-compressed',
      'application/octet-stream',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.cozyvtt')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only .cozyvtt archives are accepted.'));
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
router.get('/', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;

    // Find all campaigns where user is a member.
    // SECURITY: Do NOT include `email` in any nested user select — these
    // payloads are returned to non-admin users who can see their fellow
    // members. Emails are PII and only the owner of an account (via
    // /auth/me) or platform admins should ever receive them. Same rule
    // applies to every other endpoint in this file that embeds users.
    const memberships = await prisma.campaignMembership.findMany({
      where: { userId },
      include: {
        campaign: {
          include: {
            owner: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
              },
            },
            memberships: {
              include: {
                user: {
                  select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const campaigns = memberships.map((m) => ({
      ...m.campaign,
      userRole: m.role,
      characterIds: m.characterIds,
    }));

    return res.status(200).json({ campaigns });
  } catch (error) {
    logger.error('Error fetching campaigns', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch campaigns',
    });
  }
});

/**
 * POST /api/campaigns
 * Create a new campaign
 * Requires: Authentication
 * Note: Creator automatically becomes campaign owner and DM
 */
router.post('/', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;

    const parsed = CreateCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: parsed.error.issues[0]?.message ?? 'Invalid campaign data',
      });
    }
    const { name, description, gameSystem } = parsed.data;
    const result = await campaignCommands.dispatch<CreateCampaignCommand, Awaited<ReturnType<CreateCampaign['execute']>>>({
      type: CREATE_CAMPAIGN,
      ownerId: userId,
      name,
      description,
      gameSystem,
    });

    return res.status(201).json({
      message: 'Campaign created successfully',
      campaign: result.campaign,
    });
  } catch (error) {
    logger.error('Error creating campaign', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create campaign',
    });
  }
});

/**
 * GET /api/campaigns/:campaignId
 * Get campaign details
 * Requires: Campaign membership (any role)
 */
router.get('/:campaignId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        // SECURITY: never embed `email` in member-facing payloads —
        // any campaign member can hit this endpoint.
        owner: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
        // PERFORMANCE: return map/character METADATA only. The full
        // token/wall/fog/light blobs and full character sheets are unbounded and
        // were never used from this payload — the active map's full data loads via
        // GET /api/maps/:id (spirit-filtered) and character sheets via
        // GET /api/characters/:id. Frontend only reads ids + a few metadata fields
        // from these arrays (map move-to-map, token ownership).
        maps: {
          select: {
            id: true,
            campaignId: true,
            name: true,
            imageUrl: true,
            width: true,
            height: true,
            gridSize: true,
            feetPerSquare: true,
            diagonalRule: true,
            baseLayerUrl: true,
            spiritLayerUrl: true,
            lightingEnabled: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        characters: {
          select: {
            id: true,
            userId: true,
            campaignId: true,
            gameSystem: true,
            name: true,
            tokenImageUrl: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        // Include the most recent open session for session controls UI
        sessions: {
          where: { endedAt: null },
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: { id: true, sessionNumber: true, startedAt: true },
        },
      },
    });

    if (!campaign) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Campaign not found',
      });
    }

    // Flatten sessions array → activeSession (first open session, or null)
    const { sessions: _sessions, ...campaignRest } = campaign;
    return res.status(200).json({
      campaign: {
        ...campaignRest,
        activeSession: (_sessions && _sessions.length > 0) ? _sessions[0] : null,
        userRole: req.campaignMembership!.role,
      },
    });
  } catch (error) {
    logger.error('Error fetching campaign', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch campaign',
    });
  }
});

/**
 * GET /api/campaigns/:campaignId/characters
 * Get all characters in campaign grouped by member.
 * Includes extracted HP info per character (game-system-aware).
 * Requires: Campaign membership (any role)
 */

/** Extract { current, max, temp } from character data in a game-system-aware way */
function extractCharacterHp(
  gameSystem: string | null,
  data: unknown
): { current: number; max: number; temp: number } | null {
  if (!data || !gameSystem) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  switch (gameSystem) {
    case 'DND_5E':
    case 'PATHFINDER_2E':
    case 'FLEXIBLE': {
      if (d.hp && typeof d.hp.maximum === 'number' && d.hp.maximum > 0) {
        return {
          current: typeof d.hp.current === 'number' ? d.hp.current : d.hp.maximum,
          max: d.hp.maximum,
          temp: typeof d.hp.temporary === 'number' ? d.hp.temporary : 0,
        };
      }
      return null;
    }
    case 'CALL_OF_CTHULHU_7E': {
      const hp = d.derivedStats?.hp;
      if (hp && typeof hp.maximum === 'number' && hp.maximum > 0) {
        return {
          current: typeof hp.current === 'number' ? hp.current : hp.maximum,
          max: hp.maximum,
          temp: 0,
        };
      }
      return null;
    }
    default:
      return null;
  }
}

router.get('/:campaignId/characters', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;

    // Fetch all memberships with their character assignments
    const memberships = await prisma.campaignMembership.findMany({
      where: { campaignId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Get all character IDs from all memberships
    const allCharacterIds = memberships.flatMap((m) => m.characterIds);

    // Fetch character details including data for HP extraction
    const characters = await prisma.character.findMany({
      where: {
        id: { in: allCharacterIds },
      },
      select: {
        id: true,
        name: true,
        tokenImageUrl: true,
        gameSystem: true,
        userId: true,
        data: true,
      },
    });

    // Build response — extract HP from character data, never expose raw data
    const roster = memberships.map((membership) => {
      const memberCharacters = characters
        .filter((c) => membership.characterIds.includes(c.id))
        .map(({ data, ...char }) => ({
          ...char,
          hp: extractCharacterHp(char.gameSystem, data),
        }));

      return {
        userId: membership.userId,
        userName: membership.user.displayName,
        userAvatar: membership.user.avatarUrl,
        role: membership.role,
        joinedAt: membership.joinedAt,
        characters: memberCharacters,
      };
    });

    return res.status(200).json({ roster });
  } catch (error) {
    logger.error('Error fetching campaign characters', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch campaign characters',
    });
  }
});

/**
 * PUT /api/campaigns/:campaignId
 * Update campaign settings
 * Requires: Campaign DM role
 */
router.put('/:campaignId', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const result = await campaignCommands.dispatch<UpdateCampaignCommand, Awaited<ReturnType<UpdateCampaign['execute']>>>({ type: UPDATE_CAMPAIGN, campaignId, input: req.body });
    if (result.gameSystemCharacterCount) {
      logger.warn('campaign game system changed with existing characters', { campaignId, characterCount: result.gameSystemCharacterCount });
    }

    return res.status(200).json({
      message: 'Campaign updated successfully',
      campaign: result.campaign,
    });
  } catch (error) {
    if (sendCampaignCommandError(res, error)) return;
    logger.error('Error updating campaign', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update campaign',
    });
  }
});

/**
 * PUT /api/campaigns/:campaignId/vibe
 * Update vibe tracker settings for a campaign
 * Requires: Campaign DM role
 * Vibe Tracker Details
 */
router.put('/:campaignId/vibe', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const result = await campaignCommands.dispatch<UpdateCampaignVibeCommand, Awaited<ReturnType<UpdateCampaignVibe['execute']>>>({ type: UPDATE_CAMPAIGN_VIBE, campaignId, vibeSettings: req.body.vibeSettings });

    return res.status(200).json({
      message: 'Vibe settings updated successfully',
      vibeSettings: result.vibeSettings,
      currentVibe: result.currentVibe,
    });
  } catch (error) {
    if (sendCampaignCommandError(res, error)) return;
    logger.error('Error updating vibe settings', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update vibe settings',
    });
  }
});

/**
 * DELETE /api/campaigns/:campaignId
 * Delete a campaign
 * Requires: Campaign owner or Admin
 */
router.delete('/:campaignId', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const platformRole = req.session.platformRole!;
    const { campaignId } = req.params;

    await campaignCommands.dispatch<DeleteCampaignCommand, void>({ type: DELETE_CAMPAIGN, campaignId, requesterId: userId, platformRole });

    return res.status(200).json({
      message: 'Campaign deleted successfully',
    });
  } catch (error) {
    if (sendCampaignCommandError(res, error)) return;
    logger.error('Error deleting campaign', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete campaign',
    });
  }
});

/**
 * GET /api/campaigns/:campaignId/invitable-users
 * List all platform users who can be invited to this campaign.
 * Excludes: existing members and users with a pending invitation.
 * Requires: Campaign DM role
 */
router.get('/:campaignId/invitable-users', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;

    // Find existing member user IDs
    const memberships = await prisma.campaignMembership.findMany({
      where: { campaignId },
      select: { userId: true },
    });

    // Find pending invitation user IDs
    const pendingInvitations = await prisma.campaignInvitation.findMany({
      where: { campaignId, status: 'PENDING' },
      select: { userId: true },
    });

    const excludedIds = [
      ...memberships.map((m) => m.userId),
      ...pendingInvitations.map((i) => i.userId),
    ];

    // SECURITY: narrow select to displayName/avatar only. Any authenticated
    // DM can call this endpoint, and `sanitizeUser` only strips password/MFA
    // — it does NOT strip email. Returning emails here would let any DM
    // harvest every account's email address via the invite picker.
    const users = await prisma.user.findMany({
      where: { id: { notIn: excludedIds } },
      orderBy: { displayName: 'asc' },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    return res.status(200).json({ users });
  } catch (error) {
    logger.error('Error fetching invitable users', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch invitable users',
    });
  }
});

/**
 * POST /api/campaigns/:campaignId/invite
 * Invite a user to join the campaign.
 * Creates a pending invitation that the user must accept.
 * Requires: Campaign DM role
 * Campaign membership management
 */
router.post('/:campaignId/invite', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const result = await campaignCommands.dispatch<InviteToCampaignCommand, Awaited<ReturnType<InviteToCampaign['execute']>>>({
      type: INVITE_TO_CAMPAIGN,
      campaignId,
      invitedBy: req.session.userId!,
      userId: req.body.userId,
      expiresInDays: req.body.expiresInDays,
    });

    // Broadcast invitation.received to the invited user (WebSocket, if online)
    try {
      broadcastToUser(req.body.userId, 'invitation.received', {
        invitationId: result.invitation.invitation.id,
        campaignId,
        campaignName: result.campaign.name,
        invitedBy: req.session.userId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to broadcast invitation', { err: error });
      // Don't fail the request if broadcast fails
    }

    // Send invitation email if SMTP is configured
    if (isSmtpConfigured()) {
      sendCampaignInvitationEmail(
        result.invitedUser.email,
        result.invitedUser.displayName,
        result.campaign.name,
        result.inviterDisplayName ?? 'Your Dungeon Master',
        result.campaign.description ?? null
      ).catch((err) => {
        logger.error(`[campaigns] Failed to send invitation email to ${result.invitedUser.email}`, { err: err });
      });
    }

    return res.status(201).json({
      message: 'Invitation sent successfully',
      invitation: result.invitation,
    });
  } catch (error) {
    if (sendCampaignCommandError(res, error)) return;
    logger.error('Error inviting user to campaign', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to invite user',
    });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/members/:userId
 * Remove a member from the campaign
 * Requires: Campaign DM role
 * Cannot remove the DM
 */
router.delete('/:campaignId/members/:userId', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, userId } = req.params;
    await campaignCommands.dispatch<RemoveCampaignMemberCommand, void>({ type: REMOVE_CAMPAIGN_MEMBER, campaignId, userId });

    return res.status(200).json({
      message: 'Member removed successfully',
    });
  } catch (error) {
    if (sendCampaignCommandError(res, error)) return;
    logger.error('Error removing member from campaign', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to remove member',
    });
  }
});

/**
 * PUT /api/campaigns/:campaignId/members/:userId/role
 * Change a member's role in the campaign
 * Requires: Campaign DM role
 * Only ONE DM per campaign, cannot change DM's role
 */
router.put('/:campaignId/members/:userId/role', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, userId } = req.params;
    const updatedMembership = await campaignCommands.dispatch<ChangeCampaignMemberRoleCommand, Awaited<ReturnType<ChangeCampaignMemberRole['execute']>>>({
      type: CHANGE_CAMPAIGN_MEMBER_ROLE,
      campaignId,
      userId,
      role: req.body.role,
    });

    return res.status(200).json({
      message: 'Member role updated successfully',
      membership: updatedMembership,
    });
  } catch (error) {
    if (sendCampaignCommandError(res, error)) return;
    logger.error('Error updating member role', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update member role',
    });
  }
});

/**
 * GET /api/admin/campaigns
 * Get all campaigns in the system (Admin only)
 * Requires: Admin role
 */
router.get('/admin/all', adminOnly, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      include: {
        owner: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
        _count: {
          select: {
            memberships: true,
            maps: true,
            characters: true,
          },
        },
      },
    });

    return res.status(200).json({ campaigns });
  } catch (error) {
    logger.error('Error fetching all campaigns', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch campaigns',
    });
  }
});

/**
 * GET /api/campaigns/:campaignId/messages
 * Get chat messages for a campaign
 * Requires: Campaign member
 * Chat Messages - Load last 50 messages with pagination
 */
router.get('/:campaignId/messages', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { limit = '50', offset = '0' } = req.query;

    // Parse and validate pagination parameters
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Limit must be between 1 and 100',
      });
    }

    if (isNaN(offsetNum) || offsetNum < 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Offset must be a non-negative number',
      });
    }

    // Get total message count
    const totalCount = await prisma.message.count({
      where: { campaignId },
    });

    // Fetch messages with pagination (newest first)
    const messages = await prisma.message.findMany({
      where: { campaignId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc', // Newest first
      },
      take: limitNum,
      skip: offsetNum,
    });

    // Format messages for response (exclude DICE_ROLL messages from chat)
    const formattedMessages = messages
      .filter((msg) => msg.type !== 'DICE_ROLL')
      .map((msg) => ({
        id: msg.id,
        userId: msg.userId,
        userName: msg.user?.displayName || null,
        user: msg.user ? {
          id: msg.user.id,
          displayName: msg.user.displayName,
        } : null,
        content: msg.content,
        type: msg.type,
        metadata: msg.metadata || null,
        createdAt: msg.createdAt.toISOString(), // Changed from 'timestamp' to 'createdAt'
      }));

    return res.status(200).json({
      messages: formattedMessages,
      pagination: {
        total: totalCount,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < totalCount,
      },
    });
  } catch (error) {
    logger.error('Error fetching messages', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch messages',
    });
  }
});

/**
 * POST /api/campaigns/:campaignId/sessions
 * Start a new session
 * Requires: Campaign DM role
 * Starting a Session
 */
router.post('/:campaignId/sessions', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;

    // Check if there's already an active session
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    });

    if (!campaign) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Campaign not found',
      });
    }

    if (campaign.status === 'ACTIVE') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'A session is already active. Please end or pause the current session first.',
      });
    }

    // Get next session number
    const sessionNumber = await getNextSessionNumber(campaignId);

    // Create new session
    const session = await prisma.session.create({
      data: {
        campaignId,
        sessionNumber,
      },
    });

    // Update campaign status to ACTIVE
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'ACTIVE',
        lastPlayedAt: new Date(),
      },
    });

    // Send system message
    await sendSystemMessage(
      campaignId,
      `Session ${sessionNumber} has started!`,
      { sessionId: session.id, sessionNumber, action: 'session.started' }
    );

    // Broadcast session.started so all connected clients update campaign status
    broadcastToCampaign(campaignId, 'session.started', {
      sessionId: session.id,
      sessionNumber,
      startedAt: session.startedAt.toISOString(),
    });

    return res.status(201).json({
      message: 'Session started successfully',
      session: {
        id: session.id,
        sessionNumber: session.sessionNumber,
        startedAt: session.startedAt,
      },
    });
  } catch (error) {
    logger.error('Error starting session', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to start session',
    });
  }
});

/**
 * PUT /api/campaigns/:campaignId/sessions/:sessionId/pause
 * Pause the current session
 * Requires: Campaign DM role
 * Pausing a Session
 */
router.put('/:campaignId/sessions/:sessionId/pause', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, sessionId } = req.params;

    // Verify session exists and belongs to campaign
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        campaignId,
      },
    });

    if (!session) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Session not found',
      });
    }

    if (session.endedAt) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Session has already ended',
      });
    }

    // Capture and save current game state
    const gameState = await captureGameState(campaignId, sessionId);
    await prisma.session.update({
      where: { id: sessionId },
      data: { savedState: gameState as any },
    });

    // Update campaign status to PAUSED
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'PAUSED' },
    });

    // Send system message
    await sendSystemMessage(
      campaignId,
      `Session ${session.sessionNumber} has been paused. See you next time!`,
      { sessionId: session.id, sessionNumber: session.sessionNumber, action: 'session.paused' }
    );

    // Broadcast session.paused so all connected clients update campaign status
    broadcastToCampaign(campaignId, 'session.paused', {
      sessionId: session.id,
      sessionNumber: session.sessionNumber,
    });

    return res.status(200).json({
      message: 'Session paused successfully',
      stateSaved: true,
    });
  } catch (error) {
    logger.error('Error pausing session', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to pause session',
    });
  }
});

/**
 * PUT /api/campaigns/:campaignId/sessions/:sessionId/end
 * End the current session and save state
 * Requires: Campaign DM role
 * Ending a Session
 */
router.put('/:campaignId/sessions/:sessionId/end', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, sessionId } = req.params;
    const { saveState = true, notes } = req.body;

    // Verify session exists and belongs to campaign
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        campaignId,
      },
    });

    if (!session) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Session not found',
      });
    }

    if (session.endedAt) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Session has already ended',
      });
    }

    // Capture game state if requested
    let savedState = null;
    if (saveState) {
      const gameState = await captureGameState(campaignId, sessionId);
      savedState = gameState;
    }

    // Update session with end time, optional notes, and saved state
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        endedAt: new Date(),
        savedState: savedState as any,
        ...(notes ? { notes: String(notes).slice(0, 2000) } : {}),
      },
    });

    // Update campaign status to INACTIVE (session formally ended, not just paused)
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'INACTIVE' },
    });

    // Send system message
    await sendSystemMessage(
      campaignId,
      `Session ${session.sessionNumber} has ended.${saveState ? ' Game state saved!' : ''}`,
      {
        sessionId: session.id,
        sessionNumber: session.sessionNumber,
        action: 'session.ended',
        stateSaved: saveState,
      }
    );

    // Broadcast session.ended so all connected clients update campaign status to INACTIVE
    broadcastToCampaign(campaignId, 'session.ended', {
      sessionId: session.id,
      sessionNumber: session.sessionNumber,
    });

    return res.status(200).json({
      message: 'Session ended successfully',
      stateSaved: saveState,
    });
  } catch (error) {
    logger.error('Error ending session', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to end session',
    });
  }
});

/**
 * PUT /api/campaigns/:campaignId/resume
 * Resume the last session by restoring saved state
 * Requires: Campaign DM role
 * Resuming a Session
 */
router.put('/:campaignId/resume', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;

    // Get the most recent session
    const lastSession = await getLastSession(campaignId);

    if (!lastSession) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No previous session found',
      });
    }

    // Check if session has saved state
    if (!lastSession.savedState) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No saved state available for the last session',
      });
    }

    // Restore game state
    await restoreGameState(campaignId, lastSession.savedState as any);

    // Clear endedAt to "reopen" the session
    await prisma.session.update({
      where: { id: lastSession.id },
      data: { endedAt: null },
    });

    // Update campaign status to ACTIVE
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'ACTIVE',
        lastPlayedAt: new Date(),
      },
    });

    // Send system message
    await sendSystemMessage(
      campaignId,
      `Session ${lastSession.sessionNumber} has been resumed!`,
      {
        sessionId: lastSession.id,
        sessionNumber: lastSession.sessionNumber,
        action: 'session.resumed',
      }
    );

    // Broadcast session.resumed so all connected clients update campaign status
    broadcastToCampaign(campaignId, 'session.resumed', {
      sessionId: lastSession.id,
      sessionNumber: lastSession.sessionNumber,
      startedAt: lastSession.startedAt.toISOString(),
    });

    return res.status(200).json({
      message: 'Session resumed successfully',
      session: {
        id: lastSession.id,
        sessionNumber: lastSession.sessionNumber,
      },
    });
  } catch (error) {
    logger.error('Error resuming session', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to resume session',
    });
  }
});

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
router.get('/:campaignId/export', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const includeAudio = req.query.includeAudio === 'true';
    const includeTokens = req.query.includeTokens !== 'false'; // default true

    logger.info('Campaign export started', { campaignId, includeAudio, includeTokens, userId: req.session.userId });

    const result = await exportCampaign(campaignId, { includeAudio, includeTokens });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.buffer.length);
    return res.send(result.buffer);
  } catch (error: any) {
    logger.error('Campaign export failed', { campaignId: req.params.campaignId, error: error.message });

    if (error.message === 'Campaign not found') {
      return res.status(404).json({ error: 'Not Found', message: 'Campaign not found' });
    }

    return res.status(500).json({
      error: 'Export Failed',
      message: 'Failed to export campaign. Please try again.',
    });
  }
});

/**
 * POST /api/campaigns/import/preview
 * Upload a .cozyvtt archive and return its manifest preview.
 * Does NOT create anything — just reads manifest.json.
 * Requires: Authentication
 */
router.post('/import/preview', authenticated, (req: Request, res: Response, next: NextFunction): void => {
  importUpload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'File Too Large', message: 'Archive exceeds 500 MB limit.' });
        return;
      }
      res.status(400).json({ error: 'Upload Error', message: err.message });
      return;
    }
    if (err) {
      res.status(400).json({ error: 'Upload Error', message: err.message });
      return;
    }
    next();
  });
}, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Validation Error', message: 'No file uploaded.' });
    }

    const preview = await previewCampaignImport(req.file.buffer);
    return res.status(200).json({ preview });
  } catch (error: any) {
    logger.warn('Campaign import preview failed', { error: error.message });
    return res.status(400).json({
      error: 'Invalid Archive',
      message: error.message || 'Could not read archive.',
    });
  }
});

/**
 * POST /api/campaigns/import
 * Upload a .cozyvtt archive and create a new campaign from it.
 * Body (multipart): file + optional JSON fields:
 *   campaignName (string) — override campaign name
 *   importTokens (boolean, default true)
 * Requires: Authentication, rate limited
 */
router.post('/import', authenticated, (req: Request, res: Response, next: NextFunction): void => {
  importUpload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'File Too Large', message: 'Archive exceeds 500 MB limit.' });
        return;
      }
      res.status(400).json({ error: 'Upload Error', message: err.message });
      return;
    }
    if (err) {
      res.status(400).json({ error: 'Upload Error', message: err.message });
      return;
    }
    next();
  });
}, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Validation Error', message: 'No file uploaded.' });
    }

    const userId = req.session.userId!;
    const campaignName = typeof req.body.campaignName === 'string' ? req.body.campaignName.trim() : undefined;
    const importTokens = req.body.importTokens !== 'false'; // default true

    if (campaignName !== undefined && (campaignName.length === 0 || campaignName.length > 200)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Campaign name must be between 1 and 200 characters.',
      });
    }

    logger.info('Campaign import started', { userId, importTokens, hasNameOverride: !!campaignName });

    const result = await importCampaign(req.file.buffer, userId, {
      importTokens,
      campaignName: campaignName || undefined,
    });

    return res.status(201).json({
      message: 'Campaign imported successfully',
      ...result,
    });
  } catch (error: any) {
    logger.error('Campaign import failed', { error: error.message, userId: req.session?.userId });
    return res.status(400).json({
      error: 'Import Failed',
      message: error.message || 'Failed to import campaign.',
    });
  }
});

export default router;
