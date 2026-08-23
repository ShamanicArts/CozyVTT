/**
 * rules/dnd5e.ts
 * D&D 5e rules maths: ability modifiers, proficiency bonus, the skill list,
 * and the inference used to read proficiency back out of a printed bonus.
 *
 * ---------------------------------------------------------------------------
 * DUPLICATED FILE — these two copies must stay byte-for-byte identical:
 *   frontend/src/utils/rules/dnd5e.ts
 *   backend/src/utils/rules/dnd5e.ts
 * ---------------------------------------------------------------------------
 * The frontend and backend are separate TypeScript projects with no shared
 * package, and the repo already hand-syncs types across the boundary (see
 * docs/GAME_SYSTEMS.md). A parity test in each project compares the two files
 * and fails on any difference, so drift breaks CI rather than silently changing
 * dice maths on one side only. Edit one, copy it to the other.
 *
 * Rules references: SRD 5.1 "Monsters" (proficiency bonus by challenge rating)
 * and the Basic Rules "Using Ability Scores" (modifier derivation). Both are
 * mirrored in system-docs/Dungeons and Dragons/.
 */

// ---------------------------------------------------------------------------
// Abilities
// ---------------------------------------------------------------------------

/** The six ability keys, in the canonical stat-block order. */
export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export type AbilityKey = (typeof ABILITY_KEYS)[number];

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

/**
 * Ability modifier: floor((score - 10) / 2).
 *
 * Handles odd and sub-10 scores the way the rules do — a score of 7 is -2, not
 * -1.5 truncated toward zero, which is why this uses floor rather than trunc.
 */
export function abilityModifier(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.floor((score - 10) / 2);
}

/** Render a modifier the way a stat block does: "+3", "0", "-1". */
export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

// ---------------------------------------------------------------------------
// Proficiency bonus
// ---------------------------------------------------------------------------

/**
 * Proficiency bonus bands. A monster's proficiency bonus is taken from its
 * challenge rating on exactly the same curve a character's is taken from level,
 * so a CR 7 monster and a 7th-level character both get +3.
 *
 * CR 0, 1/8, 1/4 and 1/2 all fall in the first band.
 */
export const PROFICIENCY_BANDS: ReadonlyArray<{ maxCr: number; bonus: number }> = [
  { maxCr: 4, bonus: 2 },
  { maxCr: 8, bonus: 3 },
  { maxCr: 12, bonus: 4 },
  { maxCr: 16, bonus: 5 },
  { maxCr: 20, bonus: 6 },
  { maxCr: 24, bonus: 7 },
  { maxCr: 28, bonus: 8 },
  { maxCr: 30, bonus: 9 },
];

/** Lowest proficiency bonus in the game — the fallback when CR is unknown. */
export const MIN_PROFICIENCY_BONUS = 2;

/** Highest proficiency bonus in the game (CR 29-30). */
export const MAX_PROFICIENCY_BONUS = 9;

/**
 * Parse a challenge rating as written in a stat block into a number.
 *
 * Accepts "0", "1/8", "1/4", "1/2", "5", "21", and tolerates surrounding
 * whitespace. Returns null for anything unparseable (including "—", which some
 * sources use for creatures without a CR) so callers can decide the fallback.
 */
export function parseChallengeRating(cr: string | number | null | undefined): number | null {
  if (typeof cr === 'number') return Number.isFinite(cr) ? cr : null;
  if (!cr) return null;

  const trimmed = String(cr).trim();
  if (!trimmed) return null;

  const fraction = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    return Number(fraction[1]) / denominator;
  }

  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * Proficiency bonus for a monster of the given challenge rating.
 *
 * Unknown or unparseable CRs fall back to +2 rather than throwing: a stat block
 * with no CR is common (homebrew, imported NPCs) and the lowest bonus is the
 * least surprising default.
 */
export function proficiencyBonusForCR(cr: string | number | null | undefined): number {
  const parsed = parseChallengeRating(cr);
  if (parsed === null) return MIN_PROFICIENCY_BONUS;

  for (const band of PROFICIENCY_BANDS) {
    if (parsed <= band.maxCr) return band.bonus;
  }
  return MAX_PROFICIENCY_BONUS;
}

/**
 * Proficiency bonus for a character of the given level. Shares the CR curve —
 * kept here so the relationship is visible in one place rather than implied.
 */
export function proficiencyBonusForLevel(level: number): number {
  if (!Number.isFinite(level) || level < 1) return MIN_PROFICIENCY_BONUS;
  return proficiencyBonusForCR(Math.min(level, 30));
}

/**
 * Every challenge rating a 5e creature can have, in order.
 *
 * Offered as a fixed list rather than free text so a typo cannot silently
 * change a creature's proficiency bonus — "1/3" or "one" would fall back to +2
 * with no indication anything was wrong.
 */
export const CHALLENGE_RATINGS: readonly string[] = [
  '0',
  '1/8',
  '1/4',
  '1/2',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
];

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export interface SkillDefinition {
  /** Canonical camelCase key, matching the player-character sheet's DnD5eSkills. */
  key: string;
  /** Display name as printed in a stat block. */
  label: string;
  /** The ability a check with this skill uses. */
  ability: AbilityKey;
}

/** The eighteen 5e skills, in the alphabetical order stat blocks print them. */
export const DND5E_SKILLS: readonly SkillDefinition[] = [
  { key: 'acrobatics', label: 'Acrobatics', ability: 'dex' },
  { key: 'animalHandling', label: 'Animal Handling', ability: 'wis' },
  { key: 'arcana', label: 'Arcana', ability: 'int' },
  { key: 'athletics', label: 'Athletics', ability: 'str' },
  { key: 'deception', label: 'Deception', ability: 'cha' },
  { key: 'history', label: 'History', ability: 'int' },
  { key: 'insight', label: 'Insight', ability: 'wis' },
  { key: 'intimidation', label: 'Intimidation', ability: 'cha' },
  { key: 'investigation', label: 'Investigation', ability: 'int' },
  { key: 'medicine', label: 'Medicine', ability: 'wis' },
  { key: 'nature', label: 'Nature', ability: 'int' },
  { key: 'perception', label: 'Perception', ability: 'wis' },
  { key: 'performance', label: 'Performance', ability: 'cha' },
  { key: 'persuasion', label: 'Persuasion', ability: 'cha' },
  { key: 'religion', label: 'Religion', ability: 'int' },
  { key: 'sleightOfHand', label: 'Sleight of Hand', ability: 'dex' },
  { key: 'stealth', label: 'Stealth', ability: 'dex' },
  { key: 'survival', label: 'Survival', ability: 'wis' },
];

const SKILL_BY_NORMALIZED = new Map<string, SkillDefinition>();
for (const skill of DND5E_SKILLS) {
  // Index by a punctuation-free, lowercase form so every spelling collapses to
  // one entry: "animalHandling", "animal_handling", "Animal Handling",
  // "animal-handling" all reduce to "animalhandling".
  SKILL_BY_NORMALIZED.set(skill.key.toLowerCase(), skill);
  SKILL_BY_NORMALIZED.set(skill.label.toLowerCase().replace(/[^a-z]/g, ''), skill);
}

/**
 * Resolve any spelling of a skill name to its canonical definition.
 *
 * This matters for real data, not just tidiness: the SRD importer stores
 * Open5e's snake_case keys ("animal_handling", "sleight_of_hand"), which never
 * matched the camelCase lookup the roll picker used, so those skills lost their
 * ability association. Returns null for unrecognised names, which are kept as
 * free-form custom skills rather than silently discarded.
 */
export function findSkill(name: string): SkillDefinition | null {
  if (!name) return null;
  const normalized = name.toLowerCase().replace(/[^a-z]/g, '');
  return SKILL_BY_NORMALIZED.get(normalized) ?? null;
}

/** Canonical key for a skill name, or the trimmed input if unrecognised. */
export function normalizeSkillKey(name: string): string {
  return findSkill(name)?.key ?? name.trim();
}

/** Display label for a skill key, falling back to the raw key. */
export function skillLabel(key: string): string {
  return findSkill(key)?.label ?? key;
}

// ---------------------------------------------------------------------------
// Proficiency levels
// ---------------------------------------------------------------------------

/**
 * How proficient a creature is in a save or skill.
 *
 * 'custom' means the bonus was set explicitly and is not derived — used for
 * homebrew and for published creatures whose printed value does not decompose
 * into ability modifier plus a whole number of proficiency bonuses.
 */
export type ProficiencyLevel = 'none' | 'proficient' | 'expertise' | 'custom';

/** Multiplier applied to the proficiency bonus for each derived level. */
const PROFICIENCY_MULTIPLIER: Record<Exclude<ProficiencyLevel, 'custom'>, number> = {
  none: 0,
  proficient: 1,
  expertise: 2,
};

/**
 * The bonus a creature has in a save or skill.
 *
 * Expertise doubles the proficiency bonus, matching the player rule. Monsters
 * do get expertise — it is simply not labelled in printed stat blocks, so a
 * Goblin's Stealth +6 (Dex +2, PB +2) is doubled proficiency.
 */
export function derivedBonus(
  abilityMod: number,
  proficiencyBonus: number,
  level: Exclude<ProficiencyLevel, 'custom'>
): number {
  return abilityMod + proficiencyBonus * PROFICIENCY_MULTIPLIER[level];
}

/**
 * Work backwards from a printed bonus to the proficiency level that produces it.
 *
 * Used to read existing stat blocks — including every seeded SRD creature,
 * which stores only final totals — so the editor can show the right checkboxes
 * without changing any number. Anything that does not decompose cleanly is
 * reported as 'custom' and kept verbatim rather than "corrected".
 */
export function decomposeBonus(
  total: number,
  abilityMod: number,
  proficiencyBonus: number
): ProficiencyLevel {
  if (total === abilityMod) return 'none';
  if (total === abilityMod + proficiencyBonus) return 'proficient';
  if (total === abilityMod + proficiencyBonus * 2) return 'expertise';
  return 'custom';
}

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

/**
 * Bounds for a manually overridden save or skill bonus.
 *
 * The widest legitimate 5e value is roughly ability +10 with expertise at +9
 * proficiency (=+28) for a CR 30 creature, so ±30 admits every real stat block
 * while still rejecting the unbounded input that let "+30" be typed for a
 * commoner. This is a sanity bound, not a rules bound — deliberately generous
 * so homebrew is not blocked.
 */
export const MIN_BONUS_OVERRIDE = -30;
export const MAX_BONUS_OVERRIDE = 30;

/** Bounds for an ability score, matching the existing stat-block validation. */
export const MIN_ABILITY_SCORE = 0;
export const MAX_ABILITY_SCORE = 30;
