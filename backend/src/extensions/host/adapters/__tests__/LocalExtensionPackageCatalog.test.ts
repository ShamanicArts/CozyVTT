import { createHash } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { LocalExtensionPackageCatalog } from "../LocalExtensionPackageCatalog";

describe("LocalExtensionPackageCatalog", () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryRoots
        .splice(0)
        .map((root) => fs.rm(root, { recursive: true, force: true })),
    );
  });

  it("rejects a traversal reference before it can escape the configured package root", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "cozy-extension-root-"),
    );
    temporaryRoots.push(root);
    const catalog = new LocalExtensionPackageCatalog(root);

    await expect(catalog.discover("../outside")).rejects.toMatchObject({
      code: "PACKAGE_OUTSIDE_ROOT",
    });
  });

  it("accepts a contained, checksummed package and rejects a stale digest", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "cozy-extension-root-"),
    );
    temporaryRoots.push(root);
    const packageDirectory = path.join(root, "lantern");
    await fs.mkdir(packageDirectory);
    const entrypoint = "index.js";
    const body = `module.exports = {
  manifest: {
    manifestVersion: '1.0', id: 'cozyvtt.lantern', name: 'Lantern', version: '1.0.0', description: 'Fixture',
    compatibility: { extensionApi: '^1.0.0', cozyVtt: '^1.1.0' }, capabilities: [], permissions: [], commands: [], publishedCapabilities: [],
  },
};\n`;
    await fs.writeFile(path.join(packageDirectory, entrypoint), body);
    const digest = `sha256:${createHash("sha256").update(entrypoint).update("\0").update(body).update("\0").digest("hex")}`;
    const packageManifest = {
      packageFormat: "cozyvtt-extension-package/1",
      manifest: {
        manifestVersion: "1.0",
        id: "cozyvtt.lantern",
        name: "Lantern",
        version: "1.0.0",
        description: "Fixture",
        compatibility: { extensionApi: "^1.0.0", cozyVtt: "^1.1.0" },
        capabilities: [],
        permissions: [],
        commands: [],
        publishedCapabilities: [],
      },
      entrypoint,
      checksum: digest,
      signature: "hmac-sha256:test",
      dependencies: {},
    };
    await fs.writeFile(
      path.join(packageDirectory, "cozyvtt.extension.json"),
      JSON.stringify(packageManifest),
    );
    const catalog = new LocalExtensionPackageCatalog(root, async () => ({
      default: {
        manifest: packageManifest.manifest,
        commandHandlers: {
          "cozyvtt.lantern.light": async (input: Record<string, unknown>) =>
            input,
        },
        httpHandlers: {
          status: async () => Response.json({ status: "lit" }),
        },
      },
    }));

    const discovered = await catalog.discover("lantern");
    expect(discovered).toMatchObject({
      packagePath: await fs.realpath(packageDirectory),
      computedChecksum: digest,
    });
    const reviewed = await catalog.load(discovered);
    expect(reviewed.module.manifest.id).toBe("cozyvtt.lantern");
    await expect(
      reviewed.module.commandHandlers?.["cozyvtt.lantern.light"]?.(
        { brightness: 3 },
        {
          principal: { id: "capability-1", kind: "plugin" },
          scope: { campaignId: "campaign-1" },
        },
      ),
    ).resolves.toEqual({ brightness: 3 });
    const statusResponse = await reviewed.module.httpHandlers?.status?.(
      new Request("https://example.test/status"),
      { extensionId: "cozyvtt.lantern", routeId: "status" },
    );
    await expect(statusResponse?.json()).resolves.toEqual({ status: "lit" });
    await fs.writeFile(
      path.join(packageDirectory, entrypoint),
      `${body}// changed\n`,
    );
    await expect(catalog.discover("lantern")).resolves.toMatchObject({
      computedChecksum: expect.not.stringMatching(
        new RegExp(digest.slice("sha256:".length)),
      ),
    });
  });
});
