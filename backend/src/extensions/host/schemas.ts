import path from "path";
import { z } from "zod";
import { parseExtensionManifest } from "../schemas";
import { isValidVersionRange } from "../versioning";
import type { ExtensionPackageManifest } from "./contracts";

const packageEntrypointSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine(
    (value) => !path.isAbsolute(value) && !value.split(/[\\/]/).includes(".."),
    "Entrypoint must stay inside package",
  )
  .refine(
    (value) => /\.(?:c?js|mjs)$/.test(value),
    "Entrypoint must be a JavaScript module",
  );

const checksumSchema = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/, "Checksum must be a sha256 digest");
const themeContributionSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
    name: z.string().trim().min(1).max(120),
    contractVersion: z.literal("1.0"),
    tokens: z
      .record(
        z.string().regex(/^--[a-z0-9-]{1,80}$/),
        z.string().trim().min(1).max(512),
      )
      .refine((tokens) => Object.keys(tokens).length <= 128),
  })
  .strict();

export const extensionPackageManifestSchema: z.ZodType<ExtensionPackageManifest> =
  z
    .object({
      packageFormat: z.literal("cozyvtt-extension-package/1"),
      manifest: z.unknown().transform((value, context) => {
        try {
          return parseExtensionManifest(value);
        } catch (error) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              error instanceof Error
                ? error.message
                : "Invalid extension manifest",
          });
          return z.NEVER;
        }
      }),
      entrypoint: packageEntrypointSchema,
      checksum: checksumSchema,
      signature: z.string().trim().min(1).max(16_384).optional(),
      dependencies: z
        .record(
          z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/),
          z
            .string()
            .refine(
              isValidVersionRange,
              "Dependency version must be a supported semantic-version range",
            ),
        )
        .default({}),
      contributions: z
        .object({
          themes: z.array(themeContributionSchema).max(32).default([]),
        })
        .strict()
        .default({ themes: [] }),
    })
    .strict();

export function parseExtensionPackageManifest(
  input: unknown,
): ExtensionPackageManifest {
  return extensionPackageManifestSchema.parse(input);
}
