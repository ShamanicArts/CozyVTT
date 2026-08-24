/// <reference path="../types/express.d.ts" />
import { Router, Request, Response } from 'express';
import { publicUser } from '../application/users/UserQueries';
import { INITIALIZE_SETUP, InitializeSetupCommand, SetupError } from '../application/identity/Setup';
import { productionSetupQueries } from '../composition/productionSetupQueries';
import { productionTransportCommands } from '../composition/productionTransportCommands';
import type { IdentityUser } from '../domain/identity/Identity';
import logger from '../utils/logger';

const router = Router();

/**
 * Setup Wizard Routes
 * Initial Setup & Onboarding
 * CRITICAL: These routes must be accessible even when setup is not complete
 */

/**
 * GET /api/setup/status
 * Check if setup wizard needs to be run
 * Public endpoint - no authentication required
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    res.status(200).json(await productionSetupQueries.status());
  } catch (error) {
    logger.error('Error checking setup status', { err: error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check setup status',
    });
  }
});

/**
 * POST /api/setup/init
 * Initialize the system with first admin account
 * Public endpoint - no authentication required
 * Create admin account and complete setup
 */
router.post('/init', async (req: Request, res: Response) => {
  try {
    const user = await productionTransportCommands.dispatch<InitializeSetupCommand, IdentityUser>({
      type: INITIALIZE_SETUP,
      input: req.body,
    });

    // Create session for the new admin user
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.displayName = user.displayName;
    req.session.platformRole = user.platformRole;

    return res.status(201).json({
      message: 'Setup completed successfully',
      user: publicUser(user),
    });
  } catch (error) {
    logger.error('Error during setup', { err: error });

    if (error instanceof SetupError) {
      return res.status(400).json({
        error: error.error,
        message: error.message,
        ...(error.errors ? { errors: error.errors } : {}),
      });
    } else {
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred during setup',
      });
    }
  }
});

export default router;
