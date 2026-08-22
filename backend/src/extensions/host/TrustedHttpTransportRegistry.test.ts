import { TrustedHttpTransportRegistry } from "./TrustedHttpTransportRegistry";

describe("TrustedHttpTransportRegistry OAuth resources", () => {
  it("publishes active resources and passes bound authorization to handlers", async () => {
    const authorize = jest.fn().mockResolvedValue({
      credentialId: "credential-1",
      delegatedUserId: "user-1",
      campaignId: "campaign-1",
      resourceId: "events",
      scopes: ["events:read"],
    });
    const handler = jest.fn(async (_request, context) => Response.json(context.authorization));
    const registry = new TrustedHttpTransportRegistry({
      authorize,
      challenge: () => "Bearer",
    });
    const unregister = registry.register(
      "calendar-plugin",
      [{ id: "list-events", method: "GET", path: "/events", oauthResourceId: "events", requiredScopes: ["events:read"] }],
      [{ id: "events", path: "/events", scopes: ["events:read"] }],
      { "list-events": handler },
    );

    expect(registry.listOAuthResources()).toEqual([{
      extensionId: "calendar-plugin",
      descriptor: { id: "events", path: "/events", scopes: ["events:read"] },
    }]);

    const request = new Request("https://table.example/api/plugin-transports/calendar-plugin/events", {
      headers: { authorization: "Bearer token" },
    });
    const response = await registry.dispatch("calendar-plugin", "/events", request);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      delegatedUserId: "user-1",
      campaignId: "campaign-1",
      resourceId: "events",
      scopes: ["events:read"],
    });
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({
      extensionId: "calendar-plugin",
      requiredScopes: ["events:read"],
    }));

    unregister();
    expect(registry.listOAuthResources()).toEqual([]);
  });

  it("does not invoke protected handlers when authorization fails", async () => {
    const handler = jest.fn(async () => new Response());
    const registry = new TrustedHttpTransportRegistry({
      authorize: async () => null,
      challenge: () =>
        'Bearer resource_metadata="https://table.example/.well-known/oauth-protected-resource/events"',
    });
    registry.register(
      "calendar-plugin",
      [{ id: "events", method: "GET", path: "/events", oauthResourceId: "events", requiredScopes: [] }],
      [{ id: "events", path: "/events", scopes: [] }],
      { events: handler },
    );

    const response = await registry.dispatch(
      "calendar-plugin",
      "/events",
      new Request("https://table.example/events"),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      "resource_metadata=",
    );
    expect(handler).not.toHaveBeenCalled();
  });
});
