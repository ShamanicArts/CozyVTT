import type { ThemeColors, ThemeDefinition } from "@/themes";

/** Compatibility contract for trusted, runtime-registered theme manifests. */
export const THEME_CONTRACT_VERSION = "1.0.0" as const;
export type ThemeContractVersion = string;

export interface ThemeManifest extends ThemeDefinition {
  readonly contractVersion: ThemeContractVersion;
}

export class ThemeManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeManifestError";
  }
}

const requiredColorTokens: ReadonlyArray<keyof ThemeColors> = [
  "brand",
  "brandDark",
  "accent",
  "accentHover",
  "accentText",
  "bgBase",
  "bgSurface",
  "bgSurfaceLight",
  "bgSurfaceDark",
  "ink",
  "inkSecondary",
  "inkMuted",
  "paper",
  "danger",
  "spirit",
];

function parseRgbChannels(
  value: unknown,
  token: string,
): [number, number, number] {
  if (typeof value !== "string") {
    throw new ThemeManifestError(
      `Theme color token "${token}" must be three RGB channels between 0 and 255.`,
    );
  }
  const channels = value.trim().split(/\s+/).map(Number);
  if (
    channels.length !== 3 ||
    channels.some(
      (channel) => !Number.isInteger(channel) || channel < 0 || channel > 255,
    )
  ) {
    throw new ThemeManifestError(
      `Theme color token "${token}" must be three RGB channels between 0 and 255.`,
    );
  }
  return channels as [number, number, number];
}

function luminance(channels: [number, number, number]): number {
  const linear = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(
  first: [number, number, number],
  second: [number, number, number],
): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function assertContrast(
  colors: ThemeColors,
  foreground: keyof ThemeColors,
  background: keyof ThemeColors,
): void {
  const ratio = contrast(
    parseRgbChannels(colors[foreground], foreground),
    parseRgbChannels(colors[background], background),
  );
  if (ratio < 4.5) {
    throw new ThemeManifestError(
      `Theme requires at least 4.5:1 contrast for ${foreground} on ${background}; received ${ratio.toFixed(2)}:1.`,
    );
  }
}

/**
 * Per-workspace lifecycle owner for semantic themes. It deliberately keeps no
 * process-global mutable registry: a trusted integration registers with the
 * ThemeProvider instance that renders its workspace.
 */
export class ThemeHost {
  private readonly manifests = new Map<string, ThemeManifest>();

  constructor(
    readonly contractVersion: ThemeContractVersion = THEME_CONTRACT_VERSION,
  ) {}

  register(manifest: ThemeManifest): () => void {
    this.validate(manifest);
    if (this.manifests.has(manifest.id)) {
      throw new ThemeManifestError(
        `Theme "${manifest.id}" is already registered.`,
      );
    }
    this.manifests.set(manifest.id, manifest);
    return () => {
      if (this.manifests.get(manifest.id) === manifest)
        this.manifests.delete(manifest.id);
    };
  }

  unregister(id: string): boolean {
    return this.manifests.delete(id);
  }

  swap(manifest: ThemeManifest): void {
    this.validate(manifest);
    if (!this.manifests.has(manifest.id)) {
      throw new ThemeManifestError(
        `Theme "${manifest.id}" is not registered and cannot be swapped.`,
      );
    }
    this.manifests.set(manifest.id, manifest);
  }

  get(id: string): ThemeManifest | undefined {
    return this.manifests.get(id);
  }

  list(): ReadonlyArray<ThemeManifest> {
    return [...this.manifests.values()];
  }

  private validate(manifest: ThemeManifest): void {
    if (!manifest.id.trim())
      throw new ThemeManifestError("Theme manifests require a non-empty id.");
    if (!manifest.name.trim() || !manifest.description.trim()) {
      throw new ThemeManifestError(
        `Theme "${manifest.id}" requires a name and description.`,
      );
    }
    if (manifest.contractVersion !== this.contractVersion) {
      throw new ThemeManifestError(
        `Theme "${manifest.id}" targets contract ${manifest.contractVersion}, but this host supports ${this.contractVersion}.`,
      );
    }
    for (const token of requiredColorTokens)
      parseRgbChannels(manifest.colors[token], token);
    const background = manifest.treatments?.pageBackground;
    if (background) {
      if (background.kind !== "linear-gradient") {
        throw new ThemeManifestError(
          `Theme "${manifest.id}" has an unsupported page background treatment.`,
        );
      }
      if (
        !Number.isFinite(background.angle) ||
        background.angle < 0 ||
        background.angle > 360
      ) {
        throw new ThemeManifestError(
          `Theme "${manifest.id}" gradient angle must be between 0 and 360.`,
        );
      }
      if (background.stops.length < 2 || background.stops.length > 4) {
        throw new ThemeManifestError(
          `Theme "${manifest.id}" gradients require between two and four stops.`,
        );
      }
      let previousPosition = -1;
      for (const stop of background.stops) {
        if (!requiredColorTokens.includes(stop.token)) {
          throw new ThemeManifestError(
            `Theme "${manifest.id}" gradient references an unknown color token.`,
          );
        }
        if (
          !Number.isFinite(stop.position) ||
          stop.position < 0 ||
          stop.position > 100
        ) {
          throw new ThemeManifestError(
            `Theme "${manifest.id}" gradient stop positions must be between 0 and 100.`,
          );
        }
        if (stop.position < previousPosition) {
          throw new ThemeManifestError(
            `Theme "${manifest.id}" gradient stops must be ordered by position.`,
          );
        }
        previousPosition = stop.position;
      }
    }
    assertContrast(manifest.colors, "ink", "bgBase");
    assertContrast(manifest.colors, "ink", "bgSurface");
  }
}
