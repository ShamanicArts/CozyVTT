import type {
  ExtensionHttpHandler,
  HttpRouteDescriptor,
  OAuthResourceDescriptor,
} from "../contracts";

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

export interface RegisteredOAuthResource {
  readonly extensionId: string;
  readonly descriptor: OAuthResourceDescriptor;
}

export interface HttpTransportContextFactory {
  create(input: {
    extensionId: string;
    authorization: NonNullable<import("../contracts").ExtensionHttpContext["authorization"]>;
  }): import("../contracts").CoreExtensionGateway;
}

interface RegisteredRoute {
  readonly extensionId: string;
  readonly descriptor: HttpRouteDescriptor;
  readonly resource?: OAuthResourceDescriptor;
  readonly handler: ExtensionHttpHandler;
}

export class TrustedHttpTransportRegistry {
  private readonly routes = new Map<string, RegisteredRoute>();
  private readonly resources = new Map<string, RegisteredOAuthResource>();

  public constructor(
    private authorization?: HttpTransportAuthorizationService,
    private contexts?: HttpTransportContextFactory,
  ) {}

  setAuthorizationService(authorization: HttpTransportAuthorizationService): void {
    this.authorization = authorization;
  }

  setContextFactory(contexts: HttpTransportContextFactory): void {
    this.contexts = contexts;
  }

  listOAuthResources(): RegisteredOAuthResource[] {
    return [...this.resources.values()];
  }

  register(
    extensionId: string,
    descriptors: readonly HttpRouteDescriptor[],
    resources: readonly OAuthResourceDescriptor[],
    handlers: Readonly<Record<string, ExtensionHttpHandler>>,
  ): () => void {
    const resourceById = new Map(resources.map((resource) => [resource.id, resource]));
    for (const resource of resources) {
      const key = resourceKey(extensionId, resource.id);
      if (this.resources.has(key)) {
        throw new Error(`OAuth resource already registered: ${extensionId}/${resource.id}`);
      }
    }
    const entries = descriptors.map((descriptor): [string, RegisteredRoute] => {
      const key = routeKey(extensionId, descriptor.method, descriptor.path);
      if (this.routes.has(key)) {
        throw new Error(`HTTP transport route already registered: ${descriptor.method} ${descriptor.path}`);
      }
      return [key, {
        extensionId,
        descriptor,
        resource: descriptor.oauthResourceId
          ? resourceById.get(descriptor.oauthResourceId)
          : undefined,
        handler: handlers[descriptor.id],
      }];
    });
    for (const [key, entry] of entries) this.routes.set(key, entry);
    for (const resource of resources) {
      this.resources.set(resourceKey(extensionId, resource.id), { extensionId, descriptor: resource });
    }
    return () => {
      for (const [key, entry] of entries) {
        if (this.routes.get(key) === entry) this.routes.delete(key);
      }
      for (const resource of resources) {
        this.resources.delete(resourceKey(extensionId, resource.id));
      }
    };
  }

  async dispatch(extensionId: string, path: string, request: Request): Promise<Response> {
    const route = this.routes.get(routeKey(extensionId, request.method, path));
    if (!route) return Response.json({ error: "Not Found" }, { status: 404 });
    if (route.resource) {
      if (!this.authorization) {
        return Response.json({ error: "OAuth service unavailable" }, { status: 503 });
      }
      const authorization = await this.authorization.authorize({
        request,
        extensionId,
        resource: route.resource,
        requiredScopes: route.descriptor.requiredScopes,
      });
      if (!authorization) {
        return Response.json(
          { error: "Unauthorized" },
          {
            status: 401,
            headers: {
              "WWW-Authenticate": this.authorization.challenge({
                extensionId,
                resource: route.resource,
                requiredScopes: route.descriptor.requiredScopes,
              }),
            },
          },
        );
      }
      const response = await route.handler(request, {
        extensionId,
        routeId: route.descriptor.id,
        authorization,
        capabilities: this.contexts?.create({ extensionId, authorization }),
      });
      if (!(response instanceof Response)) {
        throw new TypeError(`HTTP handler ${route.descriptor.id} must return a Response`);
      }
      return response;
    }
    const response = await route.handler(request, {
      extensionId,
      routeId: route.descriptor.id,
    });
    if (!(response instanceof Response)) {
      throw new TypeError(`HTTP handler ${route.descriptor.id} must return a Response`);
    }
    return response;
  }
}

function resourceKey(extensionId: string, resourceId: string): string {
  return `${extensionId}\u0000${resourceId}`;
}

function routeKey(extensionId: string, method: string, path: string): string {
  return `${extensionId}\u0000${method.toUpperCase()}\u0000${path}`;
}
