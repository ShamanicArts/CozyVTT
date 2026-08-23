/**
 * statBlock.ts
 * The single definition of what a valid NPC stat block looks like.
 *
 * This schema previously existed as two near-identical copies — one in
 * tokenTemplates.ts and one in campaignImport.ts — while the creature routes,
 * which are the main authoring path, validated nothing at all beyond
 * `typeof statBlock === 'object'`. That gap is why a saving throw of +30 could
 * be stored against a commoner and then rolled as 1d20+30.
 *
 * The two original copies used different length limits, so those are parameters
 * rather than hardcoded: each caller keeps exactly the limits it had, and only
 * the genuinely new constraints (bounded save/skill bonuses, proficiency
 * metadata) are shared.
 */

import { z } from 'zod';
import {
  MAX_ABILITY_SCORE,
  MAX_BONUS_OVERRIDE,
  MAX_PROFICIENCY_BONUS,
  MIN_ABILITY_SCORE,
  MIN_BONUS_OVERRIDE,
} from '../utils/rules/dnd5e';

/**
 * Cap on how many saves or skills one stat block may carry.
 *
 * Comfortably above the eighteen 5e skills plus six saves so custom and
 * non-5e entries fit, while still bounding the size of the stored JSON.
 */
const MAX_BONUS_ENTRIES = 60;

/** Max length of a save or skill key. */
const MAX_KEY_LENGTH = 50;

export interface StatBlockSchemaOptions {
  /** Max entries in each of traits/actions/bonusActions/reactions/legendaryActions. */
  maxListEntries: number;
  /** Max length of an action or trait name. */
  maxNameLength: number;
  /** Max length of an action or trait description. */
  maxDescriptionLength: number;
  /** Max length of the speed string. */
  maxSpeedLength: number;
}

/**
 * A map of save or skill keys to bonuses.
 *
 * Keys are not enumerated here on purpose: the stat block is shared across game
 * systems, and D&D 5e's six ability saves, Pathfinder 2e's Fortitude/Reflex/Will
 * and any custom skill all have to fit. Which keys are *offered* is the editor's
 * job; this layer's job is to make the stored numbers sane.
 */
const bonusRecordSchema = z
  .record(
    z.string().trim().min(1).max(MAX_KEY_LENGTH),
    z.number().int().min(MIN_BONUS_OVERRIDE).max(MAX_BONUS_OVERRIDE)
  )
  .refine((record) => Object.keys(record).length <= MAX_BONUS_ENTRIES, {
    message: `At most ${MAX_BONUS_ENTRIES} entries are allowed`,
  });

/**
 * How proficient a creature is in a save or skill.
 * 'custom' marks a bonus that is set explicitly rather than derived.
 */
export const ProficiencyLevelSchema = z.enum(['none', 'proficient', 'expertise', 'custom']);

const proficiencyLevelRecordSchema = z
  .record(z.string().trim().min(1).max(MAX_KEY_LENGTH), ProficiencyLevelSchema)
  .refine((record) => Object.keys(record).length <= MAX_BONUS_ENTRIES, {
    message: `At most ${MAX_BONUS_ENTRIES} entries are allowed`,
  });

/**
 * Proficiency metadata — the source of truth for a derived bonus.
 *
 * Optional throughout, which is what keeps this backward compatible: a stat
 * block with no proficiency metadata (every creature stored before this change,
 * including every seeded SRD monster) keeps its stored totals verbatim and is
 * read as legacy data rather than being recomputed.
 */
const proficienciesSchema = z.object({
  /**
   * Overrides the proficiency bonus that would be derived from challenge
   * rating. For the rare published monster whose printed values do not match
   * the CR table, and for homebrew.
   */
  bonusOverride: z.number().int().min(0).max(MAX_PROFICIENCY_BONUS).optional(),
  saves: proficiencyLevelRecordSchema.optional(),
  skills: proficiencyLevelRecordSchema.optional(),
});

/**
 * Build an NPC stat block schema with caller-specific length limits.
 *
 * `.passthrough()` is preserved from both original copies so unknown keys on
 * existing stored stat blocks survive a round trip rather than being stripped.
 */
export function createNpcStatBlockSchema(options: StatBlockSchemaOptions) {
  const nameDescPairSchema = z.object({
    name: z.string().max(options.maxNameLength),
    description: z.string().max(options.maxDescriptionLength),
  });

  const listSchema = z.array(nameDescPairSchema).max(options.maxListEntries).optional();

  return z
    .object({
      ac: z.number().int().min(0).max(99),
      // Optional: stat blocks created before HP tracking have neither field
      hpMax: z.number().int().min(1).max(99999).optional(),
      hitDice: z.string().max(50).optional(),
      speed: z.string().max(options.maxSpeedLength),
      abilities: z.object({
        str: z.number().int().min(MIN_ABILITY_SCORE).max(MAX_ABILITY_SCORE),
        dex: z.number().int().min(MIN_ABILITY_SCORE).max(MAX_ABILITY_SCORE),
        con: z.number().int().min(MIN_ABILITY_SCORE).max(MAX_ABILITY_SCORE),
        int: z.number().int().min(MIN_ABILITY_SCORE).max(MAX_ABILITY_SCORE),
        wis: z.number().int().min(MIN_ABILITY_SCORE).max(MAX_ABILITY_SCORE),
        cha: z.number().int().min(MIN_ABILITY_SCORE).max(MAX_ABILITY_SCORE),
      }),
      savingThrows: bonusRecordSchema.optional(),
      skills: bonusRecordSchema.optional(),
      proficiencies: proficienciesSchema.optional(),
      damageVulnerabilities: z.string().max(500).optional(),
      damageResistances: z.string().max(500).optional(),
      damageImmunities: z.string().max(500).optional(),
      conditionImmunities: z.string().max(500).optional(),
      senses: z.string().max(500).optional(),
      languages: z.string().max(500).optional(),
      challengeRating: z.string().max(10).optional(),
      xp: z.number().int().min(0).optional(),
      traits: listSchema,
      actions: listSchema,
      bonusActions: listSchema,
      reactions: listSchema,
      legendaryActions: listSchema,
      creatureType: z.string().max(200).optional(),
      alignment: z.string().max(100).optional(),
      gameSystem: z.string().max(50).optional(),
      notes: z.string().max(5000).optional(),
    })
    .passthrough();
}

/**
 * Limits for stat blocks authored in the app (creature library, token
 * templates). Matches what tokenTemplates.ts enforced before consolidation.
 */
export const AUTHORING_STAT_BLOCK_LIMITS: StatBlockSchemaOptions = {
  maxListEntries: 50,
  maxNameLength: 200,
  maxDescriptionLength: 5000,
  maxSpeedLength: 200,
};

/**
 * Limits for stat blocks arriving in a campaign archive. Looser than the
 * authoring limits because archives may come from other instances; matches what
 * campaignImport.ts enforced before consolidation.
 */
export const IMPORT_STAT_BLOCK_LIMITS: StatBlockSchemaOptions = {
  maxListEntries: 100,
  maxNameLength: 500,
  maxDescriptionLength: 10000,
  maxSpeedLength: 500,
};

/** Stat block schema for content authored in the app. */
export const NpcStatBlockSchema = createNpcStatBlockSchema(AUTHORING_STAT_BLOCK_LIMITS);

export type NpcStatBlockInput = z.infer<typeof NpcStatBlockSchema>;
