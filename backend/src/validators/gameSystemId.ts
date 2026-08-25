import { z } from 'zod';

/** Existing uppercase IDs and namespaced extension IDs share one persisted format. */
export const GameSystemIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^(?:[A-Z][A-Z0-9_]{2,127}|[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+)$/);
