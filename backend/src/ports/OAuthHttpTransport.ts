import type { OAuthResourceDescriptor } from "../extensions/contracts";

export interface HttpTransportAuthorizationService {
  authorize(input: {
    request: Request;
    extensionId: string;
    resource: OAuthResourceDescriptor;
    requiredScopes: readonly string[];
  }): Promise<{
    credentialId: string;
    delegatedUserId: string;
    campaignId: string;
    resourceId: string;
    scopes: string[];
  } | null>;
  challenge(input: {
    extensionId: string;
    resource: OAuthResourceDescriptor;
    requiredScopes: readonly string[];
  }): string;
}

export interface TrustedHttpTransportRegistry {
  listOAuthResources(): Array<{
    extensionId: string;
    descriptor: OAuthResourceDescriptor;
  }>;
}
