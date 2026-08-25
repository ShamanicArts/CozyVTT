// ============================================
// Campaign request-body schemas.
// Replaces hand-rolled typeof checks on the create route with a Zod schema.
// On failure the route returns the same { error, message } 400 shape it
// always has, using the first issue's message.
// ============================================

import { z } from 'zod';
import { GameSystemIdSchema } from './gameSystemId';

/** POST /api/campaigns */
export const CreateCampaignSchema = z.object({
  name: z.string().trim().min(1, 'Campaign name is required').max(200, 'Campaign name must be 200 characters or fewer'),
  description: z.string().max(5000).optional(),
  gameSystem: GameSystemIdSchema.nullish(),
});

export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;
