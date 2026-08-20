import { z } from 'zod';
import {
  EXTENSION_CAPABILITIES,
  EXTENSION_PERMISSIONS,
  type AgentToolDescriptor,
  type ApplicationCommandDescriptor,
  type ExtensionManifest,
} from './contracts';
import { isValidVersionRange, isValidVersion } from './versioning';

const extensionIdPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;
const descriptorIdPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;
const toolIdPattern = /^[a-z][a-z0-9_]{2,63}$/;

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

export const agentToolDescriptorSchema: z.ZodType<AgentToolDescriptor> = z
  .object({
    id: z.string().regex(toolIdPattern, 'Use a lowercase snake_case agent tool id'),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(2_000),
    commandId: z.string().regex(descriptorIdPattern, 'Use an application command id'),
    requiredPermissions: z.array(extensionPermissionSchema).max(32),
    risk: z.enum(['read', 'low', 'high']),
    confirmation: z.enum(['never', 'when-risky', 'always']),
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
    agentTools: z.array(agentToolDescriptorSchema).max(128),
  })
  .strict()
  .superRefine((manifest, context) => {
    rejectDuplicates(manifest.capabilities, 'capabilities', context);
    rejectDuplicates(manifest.permissions, 'permissions', context);
    rejectDuplicates(manifest.commands.map((command) => command.id), 'commands', context);
    rejectDuplicates(manifest.agentTools.map((tool) => tool.id), 'agentTools', context);

    if (manifest.commands.length > 0 && !manifest.capabilities.includes('commands')) {
      context.addIssue({
        code: 'custom',
        path: ['capabilities'],
        message: 'The commands capability is required when commands are declared',
      });
    }

    if (manifest.agentTools.length > 0 && !manifest.capabilities.includes('agent-tools')) {
      context.addIssue({
        code: 'custom',
        path: ['capabilities'],
        message: 'The agent-tools capability is required when agent tools are declared',
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

    for (const tool of manifest.agentTools) {
      requireDeclaredPermissions(
        tool.requiredPermissions,
        declaredPermissions,
        ['agentTools', tool.id, 'requiredPermissions'],
        context
      );

      const command = commands.get(tool.commandId);
      if (!command) {
        context.addIssue({
          code: 'custom',
          path: ['agentTools', tool.id, 'commandId'],
          message: `Agent tool targets undeclared command ${tool.commandId}`,
        });
        continue;
      }

      const toolPermissions = new Set(tool.requiredPermissions);
      for (const permission of command.requiredPermissions) {
        if (!toolPermissions.has(permission)) {
          context.addIssue({
            code: 'custom',
            path: ['agentTools', tool.id, 'requiredPermissions'],
            message: `Agent tool must declare command permission ${permission}`,
          });
        }
      }

      if (tool.risk === 'high' && tool.confirmation === 'never') {
        context.addIssue({
          code: 'custom',
          path: ['agentTools', tool.id, 'confirmation'],
          message: 'High-risk agent tools must require a confirmation policy',
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
