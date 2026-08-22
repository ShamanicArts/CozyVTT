import { SandboxRegistryProxy } from "../SandboxRegistryProxy";

describe("sandboxed extension transport isolation", () => {
  it("rejects host HTTP and OAuth contributions before activation", async () => {
    const proxy = new SandboxRegistryProxy(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      proxy.activate({
        extensionId: "cozyvtt.sandbox-fixture",
        packageManifest: {
          manifest: {
            manifestVersion: "1.0",
            id: "cozyvtt.sandbox-fixture",
            name: "Sandbox fixture",
            version: "1.0.0",
            description: "Transport isolation fixture",
            compatibility: {
              extensionApi: "^1.0.0",
              cozyVtt: "^1.1.0",
            },
            capabilities: ["http-transports"],
            permissions: [],
            commands: [],
            publishedCapabilities: [],
            httpRoutes: [
              {
                id: "transport.fixture",
                method: "GET",
                path: "/fixture",
                requiredScopes: [],
              },
            ],
          },
        },
      } as never),
    ).rejects.toThrow("Sandboxed extensions cannot contribute HTTP transports");
  });
});
