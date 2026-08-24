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
    treatments: z
      .object({
        pageBackground: z
          .object({
            kind: z.literal("linear-gradient"),
            angle: z.number().min(0).max(360),
            stops: z
              .array(
                z
                  .object({
                    token: z.string().regex(/^--color-[a-z0-9-]{1,80}$/),
                    position: z.number().min(0).max(100),
                  })
                  .strict(),
              )
              .min(2)
              .max(4)
              .refine((stops) =>
                stops.every(
                  (stop, index) =>
                    index === 0 || stop.position >= stops[index - 1].position,
                ),
              ),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const rendererContributionSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
    name: z.string().trim().min(1).max(120),
    contractVersion: z.literal("1.0.0"),
    browserEntrypoint: packageEntrypointSchema,
  })
  .strict();
export const campaignPresentationContributionSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
    title: z.string().trim().min(1).max(120),
    contractVersion: z.literal("1"),
    browserEntrypoint: packageEntrypointSchema,
    roles: z
      .array(z.enum(["DM", "PLAYER", "SPECTATOR"]))
      .min(1)
      .max(3)
      .refine((roles) => new Set(roles).size === roles.length),
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
          renderers: z.array(rendererContributionSchema).max(16).default([]),
          presentations: z
            .array(campaignPresentationContributionSchema)
            .max(16)
            .default([]),
        })
        .strict()
        .default({ themes: [], renderers: [], presentations: [] }),
    })
    .strict()
    .superRefine((packageManifest, context) => {
      if (
        packageManifest.contributions.presentations.length > 0 &&
        !packageManifest.manifest.capabilities.includes("presentations")
      ) {
        context.addIssue({
          code: "custom",
          path: ["manifest", "capabilities"],
          message:
            "The presentations capability is required when campaign presentations are declared",
        });
      }
    });

export function parseExtensionPackageManifest(
  input: unknown,
): ExtensionPackageManifest {
  return extensionPackageManifestSchema.parse(input);
}
