import { parseExtensionPackageManifest } from "../schemas";

const checksum = `sha256:${"a".repeat(64)}`;

function packageManifest() {
  return {
    packageFormat: "cozyvtt-extension-package/1",
    manifest: {
      manifestVersion: "1.0",
      id: "cozyvtt.theme-test",
      name: "Theme Test",
      version: "1.0.0",
      description: "Exercises data-only theme treatments.",
      compatibility: { extensionApi: "^1.0.0", cozyVtt: "^1.1.0" },
      capabilities: [],
      permissions: [],
      commands: [],
      publishedCapabilities: [],
    },
    entrypoint: "index.js",
    checksum,
    dependencies: {},
    contributions: {
      themes: [
        {
          id: "solid-or-dawn",
          name: "Solid or Dawn",
          contractVersion: "1.0",
          tokens: {
            "--color-bg-base": "255 249 230",
            "--color-bg-surface": "244 236 216",
          },
          treatments: {
            pageBackground: {
              kind: "linear-gradient",
              angle: 45,
              stops: [
                { token: "--color-bg-base", position: 0 },
                { token: "--color-bg-surface", position: 100 },
              ],
            },
          },
        },
      ],
      renderers: [],
    },
  };
}

describe("extension package theme treatments", () => {
  it("accepts a bounded, data-only optional gradient", () => {
    expect(
      parseExtensionPackageManifest(packageManifest()).contributions.themes[0],
    ).toMatchObject({
      id: "solid-or-dawn",
      treatments: { pageBackground: { kind: "linear-gradient", angle: 45 } },
    });
  });

  it("rejects unordered gradient stops", () => {
    const input = packageManifest();
    input.contributions.themes[0].treatments.pageBackground.stops = [
      { token: "--color-bg-base", position: 90 },
      { token: "--color-bg-surface", position: 10 },
    ];

    expect(() => parseExtensionPackageManifest(input)).toThrow();
  });
});
