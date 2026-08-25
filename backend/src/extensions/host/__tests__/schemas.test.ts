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
      presentations: [],
      gameSystems: [],
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

describe("extension package campaign presentations", () => {
  it("defaults presentations to an empty list", () => {
    const input = packageManifest();
    delete (input.contributions as { presentations?: unknown }).presentations;
    expect(
      parseExtensionPackageManifest(input).contributions.presentations,
    ).toEqual([]);
  });

  it("accepts role-filtered presentations with the required capability", () => {
    const input = packageManifest();
    (input.manifest.capabilities as string[]).push("presentations");
    (
      input.contributions.presentations as Array<Record<string, unknown>>
    ).push({
      id: "campaign-stage",
      title: "Campaign Stage",
      contractVersion: "1",
      browserEntrypoint: "presentation.mjs",
      roles: ["DM", "PLAYER"],
    });

    expect(
      parseExtensionPackageManifest(input).contributions.presentations[0],
    ).toMatchObject({ id: "campaign-stage", roles: ["DM", "PLAYER"] });
  });

  it("rejects presentation declarations without the capability", () => {
    const input = packageManifest();
    (
      input.contributions.presentations as Array<Record<string, unknown>>
    ).push({
      id: "campaign-stage",
      title: "Campaign Stage",
      contractVersion: "1",
      browserEntrypoint: "presentation.mjs",
      roles: ["DM"],
    });

    expect(() => parseExtensionPackageManifest(input)).toThrow(
      "presentations capability",
    );
  });
});

describe("extension package game systems", () => {
  const dndContribution = {
    id: "DND_5E",
    name: "Dungeons & Dragons 5th Edition",
    shortName: "D&D 5e",
    description: "Compatibility contribution for the existing persisted system.",
    contractVersion: "1",
    selectable: true,
    browserEntrypoint: "dnd5e.mjs",
    characterDataSchema: {
      type: "object",
      required: ["characterName"],
      properties: { characterName: { type: "string" } },
    },
    characterTemplates: [
      {
        id: "blank",
        name: "Blank Character",
        description: "An empty character sheet.",
        data: { characterName: "New Character" },
      },
    ],
  };

  it("defaults game systems to an empty list", () => {
    const input = packageManifest();
    delete (input.contributions as { gameSystems?: unknown }).gameSystems;
    expect(parseExtensionPackageManifest(input).contributions.gameSystems).toEqual([]);
  });

  it("accepts bounded game systems with the required capability", () => {
    const input = packageManifest();
    (input.manifest.capabilities as string[]).push("game-systems");
    (input.contributions.gameSystems as Array<Record<string, unknown>>).push(dndContribution);

    expect(parseExtensionPackageManifest(input).contributions.gameSystems[0]).toMatchObject({
      id: "DND_5E",
      contractVersion: "1",
      characterTemplates: [{ id: "blank" }],
    });
  });

  it("rejects game systems without the capability", () => {
    const input = packageManifest();
    (input.contributions.gameSystems as Array<Record<string, unknown>>).push(dndContribution);

    expect(() => parseExtensionPackageManifest(input)).toThrow("game-systems capability");
  });

  it("rejects duplicate template IDs", () => {
    const input = packageManifest();
    (input.manifest.capabilities as string[]).push("game-systems");
    (input.contributions.gameSystems as Array<Record<string, unknown>>).push({
      ...dndContribution,
      characterTemplates: [
        dndContribution.characterTemplates[0],
        dndContribution.characterTemplates[0],
      ],
    });

    expect(() => parseExtensionPackageManifest(input)).toThrow("template IDs must be unique");
  });

  it("rejects duplicate game-system IDs", () => {
    const input = packageManifest();
    (input.manifest.capabilities as string[]).push("game-systems");
    (input.contributions.gameSystems as Array<Record<string, unknown>>).push(
      dndContribution,
      dndContribution,
    );

    expect(() => parseExtensionPackageManifest(input)).toThrow(
      "Game-system IDs must be unique",
    );
  });
});
