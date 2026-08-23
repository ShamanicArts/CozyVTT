/**
 * prisma-json.ts
 * Bridges validated payloads into Prisma's JSON column types.
 *
 * Zod produces object types whose optional properties are `T | undefined`,
 * which Prisma's InputJsonValue does not accept even though the value
 * serialises fine — `undefined` keys simply vanish. This helper makes the
 * conversion explicit and one-line rather than scattering casts through routes.
 */

import { Prisma } from '@prisma/client';

/** Convert a validated value to a Prisma JSON input, mapping null/undefined to JSON null. */
export function jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value == null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

/**
 * Convert a value that is known to be present into a Prisma JSON input.
 * Use where the schema guarantees the field exists (a required stat block).
 */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
