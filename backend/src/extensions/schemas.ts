import { z } from 'zod';
import {
  EXTENSION_CAPABILITIES,
  EXTENSION_PERMISSIONS,
  type PublishedCapabilityDescriptor,
  type ApplicationCommandDescriptor,
  type ExtensionManifest,
  type HttpRouteDescriptor,
  type OAuthResourceDescriptor,
} from './contracts';
import { isValidVersionRange, isValidVersion } from './versioning';

const extensionIdPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;
const descriptorIdPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;
const capabilityIdPattern = /^[a-z][a-z0-9_]{2,63}$/;

const semverSchema = z.string().refine(isValidVersion, 'Expected a semantic version such as 1.0.0');
const versionRangeSchema = z.string().refine(
  isValidVersionRange,
  'Expected a supported semantic-version range'
);
const jsonSchemaSchema = z.record(z.string(), z.unknown());

export const extensionPermissionSchema = z.enum(EXTENSION_PERMISSIONS);
export const extensionCapabilitySchema = z.enum(EXTENSION_CAPABILITIES);

export const applicationCommandDescriptorSchema: z.ZodType<ApplicationCommandDescriptor> = z
  .object({
    id: z.string().regex(descriptorIdPattern, 'Use a dotted or dashed application command id'),
    version: semverSchema,
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(2_000),
    inputSchema: jsonSchemaSchema,
    outputSchema: jsonSchemaSchema,
    requiredPermissions: z.array(extensionPermissionSchema).max(32),
    idempotent: z.boolean(),
  })
  .strict();

export const publishedCapabilityDescriptorSchema: z.ZodType<PublishedCapabilityDescriptor> = z
  .object({
    id: z.string().regex(capabilityIdPattern, 'Use a lowercase snake_case capability id'),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(2_000),
    commandId: z.string().regex(descriptorIdPattern, 'Use an application command id'),
    requiredPermissions: z.array(extensionPermissionSchema).max(32),
    risk: z.enum(['read', 'low', 'high']),
    approval: z.enum(['never', 'when-risky', 'always']),
  })
  .strict();

const contributionIdSchema = z.string().regex(descriptorIdPattern, 'Use a dotted or dashed contribution id');
const transportPathSchema = z
  .string()
  .regex(/^\/(?:[a-zA-Z0-9._~-]+(?:\/[a-zA-Z0-9._~-]+)*)?$/, 'Use a canonical relative HTTP path')
  .refine((value) => !value.split('/').includes('..'), 'HTTP path must not traverse directories');
const oauthScopeSchema = z.string().regex(/^[a-zA-Z0-9._:-]{1,128}$/, 'Use a valid OAuth scope');

export const httpRouteDescriptorSchema: z.ZodType<HttpRouteDescriptor> = z
  .object({
    id: contributionIdSchema,
    method: z.enum(['DELETE', 'GET', 'PATCH', 'POST', 'PUT']),
    path: transportPathSchema,
    oauthResourceId: contributionIdSchema.optional(),
    requiredScopes: z.array(oauthScopeSchema).max(32),
  })
  .strict();

export const oauthResourceDescriptorSchema: z.ZodType<OAuthResourceDescriptor> = z
  .object({
    id: contributionIdSchema,
    path: transportPathSchema,
    scopes: z.array(oauthScopeSchema).max(64),
  })
  .strict();

export const extensionManifestSchema: z.ZodType<ExtensionManifest> = z
  .object({
    manifestVersion: z.literal('1.0'),
    id: z.string().regex(extensionIdPattern, 'Use a reverse-domain-like extension id'),
    name: z.string().trim().min(1).max(120),
    version: semverSchema,
    description: z.string().trim().min(1).max(2_000),
    compatibility: z
      .object({
        extensionApi: versionRangeSchema,
        cozyVtt: versionRangeSchema,
      })
      .strict(),
    capabilities: z.array(extensionCapabilitySchema).max(32),
    permissions: z.array(extensionPermissionSchema).max(32),
    commands: z.array(applicationCommandDescriptorSchema).max(128),
    publishedCapabilities: z.array(publishedCapabilityDescriptorSchema).max(128),
    httpRoutes: z.array(httpRouteDescriptorSchema).max(64).optional(),
    oauthResources: z.array(oauthResourceDescriptorSchema).max(16).optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    rejectDuplicates(manifest.capabilities, 'capabilities', context);
    rejectDuplicates(manifest.permissions, 'permissions', context);
    rejectDuplicates(manifest.commands.map((command) => command.id), 'commands', context);
    rejectDuplicates(manifest.publishedCapabilities.map((capability) => capability.id), 'publishedCapabilities', context);
    rejectDuplicates((manifest.httpRoutes ?? []).map((route) => route.id), 'httpRoutes', context);
    rejectDuplicates(
      (manifest.httpRoutes ?? []).map((route) => `${route.method} ${route.path}`),
      'httpRoutes',
      context
    );
    rejectDuplicates((manifest.oauthResources ?? []).map((resource) => resource.id), 'oauthResources', context);
    rejectDuplicates((manifest.oauthResources ?? []).map((resource) => resource.path), 'oauthResources', context);

    if ((manifest.httpRoutes?.length ?? 0) > 0 && !manifest.capabilities.includes('http-transports')) {
      context.addIssue({
        code: 'custom',
        path: ['capabilities'],
        message: 'The http-transports capability is required when HTTP routes are declared',
      });
    }

    const resources = new Map((manifest.oauthResources ?? []).map((resource) => [resource.id, resource]));
    for (const route of manifest.httpRoutes ?? []) {
      if (route.requiredScopes.length > 0 && !route.oauthResourceId) {
        context.addIssue({ code: 'custom', path: ['httpRoutes', route.id, 'oauthResourceId'], message: 'Scoped HTTP routes require an OAuth resource' });
        continue;
      }
      if (!route.oauthResourceId) continue;
      const resource = resources.get(route.oauthResourceId);
      if (!resource) {
        context.addIssue({ code: 'custom', path: ['httpRoutes', route.id, 'oauthResourceId'], message: `HTTP route references undeclared OAuth resource ${route.oauthResourceId}` });
        continue;
      }
      if (resource.path !== '/' && route.path !== resource.path && !route.path.startsWith(`${resource.path}/`)) {
        context.addIssue({ code: 'custom', path: ['httpRoutes', route.id, 'path'], message: `HTTP route must be within OAuth resource path ${resource.path}` });
      }
      const declaredScopes = new Set(resource.scopes);
      for (const scope of route.requiredScopes) {
        if (!declaredScopes.has(scope)) {
          context.addIssue({ code: 'custom', path: ['httpRoutes', route.id, 'requiredScopes'], message: `OAuth scope ${scope} is not declared by resource ${resource.id}` });
        }
      }
    }

    if (manifest.commands.length > 0 && !manifest.capabilities.includes('commands')) {
      context.addIssue({
        code: 'custom',
        path: ['capabilities'],
        message: 'The commands capability is required when commands are declared',
      });
    }

    if (manifest.publishedCapabilities.length > 0 && !manifest.capabilities.includes('capability-publications')) {
      context.addIssue({
        code: 'custom',
        path: ['capabilities'],
        message: 'The capability-publications capability is required when capability capabilities are declared',
      });
    }

    const declaredPermissions = new Set(manifest.permissions);
    const commands = new Map(manifest.commands.map((command) => [command.id, command]));
    for (const command of manifest.commands) {
      requireDeclaredPermissions(
        command.requiredPermissions,
        declaredPermissions,
        ['commands', command.id, 'requiredPermissions'],
        context
      );
    }

    for (const capability of manifest.publishedCapabilities) {
      requireDeclaredPermissions(
        capability.requiredPermissions,
        declaredPermissions,
        ['publishedCapabilities', capability.id, 'requiredPermissions'],
        context
      );

      const command = commands.get(capability.commandId);
      if (!command) {
        context.addIssue({
          code: 'custom',
          path: ['publishedCapabilities', capability.id, 'commandId'],
          message: `Published capability targets undeclared command ${capability.commandId}`,
        });
        continue;
      }

      const toolPermissions = new Set(capability.requiredPermissions);
      for (const permission of command.requiredPermissions) {
        if (!toolPermissions.has(permission)) {
          context.addIssue({
            code: 'custom',
            path: ['publishedCapabilities', capability.id, 'requiredPermissions'],
            message: `Published capability must declare command permission ${permission}`,
          });
        }
      }

      if (capability.risk === 'high' && capability.approval === 'never') {
        context.addIssue({
          code: 'custom',
          path: ['publishedCapabilities', capability.id, 'approval'],
          message: 'High-risk capability capabilities must require an approval policy',
        });
      }
    }
  });

export function parseExtensionManifest(input: unknown): ExtensionManifest {
  return extensionManifestSchema.parse(input);
}

function rejectDuplicates(values: readonly string[], field: string, context: z.RefinementCtx): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      context.addIssue({
        code: 'custom',
        path: [field],
        message: `Duplicate value ${value}`,
      });
    }
    seen.add(value);
  }
}

function requireDeclaredPermissions(
  required: readonly string[],
  declared: ReadonlySet<string>,
  path: (string | number)[],
  context: z.RefinementCtx
): void {
  for (const permission of required) {
    if (!declared.has(permission)) {
      context.addIssue({
        code: 'custom',
        path,
        message: `Permission ${permission} must be declared in manifest.permissions`,
      });
    }
  }
}
