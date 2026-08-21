import type { JsonSchema } from "../contracts";

export class JsonSchemaValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Schema validation failed: ${issues.join("; ")}`);
    this.name = "JsonSchemaValidationError";
  }
}

/**
 * A deliberately small, deterministic JSON Schema validator. It supports the
 * portable draft-style constructs CozyVTT manifests need today and rejects
 * unsupported keywords rather than silently weakening a descriptor contract.
 */
export function validateJsonSchema(schema: JsonSchema, value: unknown): void {
  const issues: string[] = [];
  validate(schema, value, "$", issues, 0);
  if (issues.length > 0) throw new JsonSchemaValidationError(issues);
}

const supportedKeywords = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
  "minProperties",
  "maxProperties",
]);

function validate(
  schema: JsonSchema,
  value: unknown,
  path: string,
  issues: string[],
  depth: number,
): void {
  if (depth > 32) {
    issues.push(`${path}: schema nesting exceeds 32 levels`);
    return;
  }

  for (const key of Object.keys(schema)) {
    if (!supportedKeywords.has(key))
      issues.push(`${path}: unsupported schema keyword ${key}`);
  }
  if (issues.length > 0) return;

  const expectedType = schema.type;
  if (typeof expectedType === "string" && !matchesType(expectedType, value)) {
    issues.push(`${path}: expected ${expectedType}`);
    return;
  }
  if (
    Array.isArray(expectedType) &&
    !expectedType.some(
      (candidate) =>
        typeof candidate === "string" && matchesType(candidate, value),
    )
  ) {
    issues.push(`${path}: expected one of ${expectedType.join(", ")}`);
    return;
  }

  if ("const" in schema && !sameJsonValue(value, schema.const))
    issues.push(`${path}: must equal const value`);
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((allowed) => sameJsonValue(value, allowed))
  ) {
    issues.push(`${path}: must be one of enum values`);
  }

  if (typeof value === "string") validateString(schema, value, path, issues);
  if (typeof value === "number") validateNumber(schema, value, path, issues);
  if (Array.isArray(value)) validateArray(schema, value, path, issues, depth);
  if (isPlainObject(value)) validateObject(schema, value, path, issues, depth);
}

function validateString(
  schema: JsonSchema,
  value: string,
  path: string,
  issues: string[],
): void {
  if (typeof schema.minLength === "number" && value.length < schema.minLength)
    issues.push(`${path}: is shorter than minLength`);
  if (typeof schema.maxLength === "number" && value.length > schema.maxLength)
    issues.push(`${path}: is longer than maxLength`);
}

function validateNumber(
  schema: JsonSchema,
  value: number,
  path: string,
  issues: string[],
): void {
  if (!Number.isFinite(value)) issues.push(`${path}: must be a finite number`);
  if (typeof schema.minimum === "number" && value < schema.minimum)
    issues.push(`${path}: is below minimum`);
  if (typeof schema.maximum === "number" && value > schema.maximum)
    issues.push(`${path}: is above maximum`);
}

function validateArray(
  schema: JsonSchema,
  value: unknown[],
  path: string,
  issues: string[],
  depth: number,
): void {
  if (typeof schema.minItems === "number" && value.length < schema.minItems)
    issues.push(`${path}: has fewer than minItems`);
  if (typeof schema.maxItems === "number" && value.length > schema.maxItems)
    issues.push(`${path}: has more than maxItems`);
  if (isSchema(schema.items))
    value.forEach((item, index) =>
      validate(
        schema.items as JsonSchema,
        item,
        `${path}[${index}]`,
        issues,
        depth + 1,
      ),
    );
}

function validateObject(
  schema: JsonSchema,
  value: Record<string, unknown>,
  path: string,
  issues: string[],
  depth: number,
): void {
  const propertyCount = Object.keys(value).length;
  if (
    typeof schema.minProperties === "number" &&
    propertyCount < schema.minProperties
  )
    issues.push(`${path}: has fewer than minProperties`);
  if (
    typeof schema.maxProperties === "number" &&
    propertyCount > schema.maxProperties
  )
    issues.push(`${path}: has more than maxProperties`);

  const properties = isPlainObject(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((key): key is string => typeof key === "string")
    : [];
  for (const property of required)
    if (!(property in value)) issues.push(`${path}.${property}: is required`);

  for (const [key, child] of Object.entries(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      issues.push(`${path}.${key}: unsafe property name`);
      continue;
    }
    const propertySchema = properties[key];
    if (isSchema(propertySchema)) {
      validate(propertySchema, child, `${path}.${key}`, issues, depth + 1);
    } else if (schema.additionalProperties === false) {
      issues.push(`${path}.${key}: additional properties are not allowed`);
    } else if (isSchema(schema.additionalProperties)) {
      validate(
        schema.additionalProperties,
        child,
        `${path}.${key}`,
        issues,
        depth + 1,
      );
    }
  }
}

function matchesType(type: string, value: unknown): boolean {
  if (type === "object") return isPlainObject(value);
  if (type === "array") return Array.isArray(value);
  if (type === "null") return value === null;
  if (type === "integer")
    return typeof value === "number" && Number.isInteger(value);
  return typeof value === type;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSchema(value: unknown): value is JsonSchema {
  return isPlainObject(value);
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
