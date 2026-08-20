import type { ExtensionPermission } from '../../extensions/contracts';

/** Identity supplied by a trusted transport adapter, never by an extension. */
export interface AgentPrincipal {
  id: string;
  kind: 'user' | 'service' | 'agent';
}

/** Every agent call is explicitly bound to one campaign. */
export interface CampaignScope {
  campaignId: string;
}

export interface ExtensionPermissionCheck {
  principal: AgentPrincipal;
  scope: CampaignScope;
  extensionId: string;
  permissions: readonly ExtensionPermission[];
}

export interface PermissionDecision {
  allowed: boolean;
  missing: ExtensionPermission[];
}

/**
 * Port for the future authorization service. A declaration in a manifest is
 * deliberately insufficient: this port must return an explicit grant.
 */
export interface ExtensionPolicyPort {
  check(check: ExtensionPermissionCheck): Promise<PermissionDecision>;
}

export interface ExtensionPermissionGrant {
  principalId: string;
  campaignId: string;
  extensionId: string;
  permissions: readonly ExtensionPermission[];
}

/** Safe default for deployments that have not provisioned extension grants. */
export class DenyAllExtensionPolicy implements ExtensionPolicyPort {
  async check(check: ExtensionPermissionCheck): Promise<PermissionDecision> {
    return { allowed: false, missing: [...new Set(check.permissions)] };
  }
}

/**
 * Small in-memory policy adapter for tests and local bootstrap wiring. It is
 * intentionally exact-scoped: grants never spill into another campaign,
 * principal, or extension.
 */
export class InMemoryExtensionPolicy implements ExtensionPolicyPort {
  private readonly grants: ExtensionPermissionGrant[];

  constructor(grants: readonly ExtensionPermissionGrant[] = []) {
    this.grants = grants.map((grant) => ({ ...grant, permissions: [...grant.permissions] }));
  }

  grant(grant: ExtensionPermissionGrant): void {
    this.grants.push({ ...grant, permissions: [...grant.permissions] });
  }

  async check(check: ExtensionPermissionCheck): Promise<PermissionDecision> {
    const granted = new Set<ExtensionPermission>();
    for (const grant of this.grants) {
      if (
        grant.principalId === check.principal.id &&
        grant.campaignId === check.scope.campaignId &&
        grant.extensionId === check.extensionId
      ) {
        for (const permission of grant.permissions) granted.add(permission);
      }
    }

    const missing = [...new Set(check.permissions)].filter((permission) => !granted.has(permission));
    return { allowed: missing.length === 0, missing };
  }
}
