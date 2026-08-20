import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import type {
  ExtensionCommandHandler,
  ExtensionLifecycleContext,
  ExtensionModule,
} from "../../contracts";
import { parseExtensionManifest } from "../../schemas";
import {
  ExtensionHostError,
  type DiscoveredExtensionPackage,
  type ExtensionPackageManifest,
  type ReviewedExtensionPackage,
} from "../contracts";
import type { ExtensionPackageCatalog } from "../ports";
import { parseExtensionPackageManifest } from "../schemas";

const PACKAGE_MANIFEST_FILE = "cozyvtt.extension.json";
const nativeDynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

/** A filesystem package reader with realpath containment and deterministic digesting. */
export class LocalExtensionPackageCatalog implements ExtensionPackageCatalog {
  private readonly rootPath: string;

  public constructor(
    packageRoot: string,
    private readonly moduleImporter: (
      specifier: string,
    ) => Promise<unknown> = nativeDynamicImport,
  ) {
    this.rootPath = path.resolve(packageRoot);
  }

  public async listAvailable(): Promise<DiscoveredExtensionPackage[]> {
    const root = await realpathOrHostError(
      this.rootPath,
      "Configured extension package root is unavailable",
    );
    const entries = await fs.readdir(root, { withFileTypes: true });
    const packages: DiscoveredExtensionPackage[] = [];
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      try {
        packages.push(await this.discover(entry.name));
      } catch {
        // A directory is not a package until its complete manifest and digest
        // validate; do not leak malformed local filesystem details.
      }
    }
    return packages;
  }

  public async discover(
    packageReference: string,
  ): Promise<DiscoveredExtensionPackage> {
    if (
      !packageReference ||
      path.isAbsolute(packageReference) ||
      packageReference.split(/[\\/]/).includes("..")
    ) {
      throw new ExtensionHostError(
        "Package reference must be a relative directory name",
        "PACKAGE_OUTSIDE_ROOT",
      );
    }
    return this.readPackage(path.resolve(this.rootPath, packageReference));
  }

  public async discoverInstalled(
    packagePath: string,
  ): Promise<DiscoveredExtensionPackage> {
    return this.readPackage(packagePath);
  }

  public async load(
    discovered: DiscoveredExtensionPackage,
  ): Promise<ReviewedExtensionPackage> {
    // Re-read immediately before import so a package changed after discovery
    // cannot reuse an earlier trusted digest.
    const current = await this.readPackage(discovered.packagePath);
    if (
      current.computedChecksum !== discovered.computedChecksum ||
      JSON.stringify(current.packageManifest) !==
        JSON.stringify(discovered.packageManifest)
    ) {
      throw new ExtensionHostError(
        "Extension package changed after review",
        "CHECKSUM_MISMATCH",
      );
    }
    let imported: unknown;
    try {
      // Keep native `import()` after TypeScript compiles this backend to
      // CommonJS. A transpiled `require(file://...)` would reject valid ESM
      // package entrypoints.
      imported = await this.moduleImporter(
        pathToFileURL(current.entrypointPath).href,
      );
    } catch (error) {
      throw new ExtensionHostError(
        `Could not import ${discovered.packageManifest.manifest.id}`,
        "INVALID_PACKAGE",
        error,
      );
    }
    const module = readExtensionModule(imported);
    const loadedManifest = parseExtensionManifest(module.manifest);
    if (
      JSON.stringify(loadedManifest) !==
      JSON.stringify(current.packageManifest.manifest)
    ) {
      throw new ExtensionHostError(
        "Runtime manifest differs from reviewed package manifest",
        "INVALID_PACKAGE",
      );
    }
    return { ...current, module: { ...module, manifest: loadedManifest } };
  }

  public async readBrowserModule(
    discovered: DiscoveredExtensionPackage,
    relativePath: string,
  ): Promise<Buffer> {
    const current = await this.readPackage(discovered.packagePath);
    if (
      current.computedChecksum !== discovered.computedChecksum ||
      JSON.stringify(current.packageManifest) !==
        JSON.stringify(discovered.packageManifest)
    ) {
      throw new ExtensionHostError(
        "Extension package changed after review",
        "CHECKSUM_MISMATCH",
      );
    }
    if (
      path.isAbsolute(relativePath) ||
      relativePath.split(/[\\/]/).includes("..") ||
      !/\.(?:c?js|mjs)$/.test(relativePath)
    ) {
      throw new ExtensionHostError(
        "Browser module path is invalid",
        "PACKAGE_OUTSIDE_ROOT",
      );
    }
    const candidate = path.resolve(current.packagePath, relativePath);
    assertContained(current.packagePath, candidate);
    const realCandidate = await realpathOrHostError(
      candidate,
      "Browser module is unavailable",
    );
    assertContained(current.packagePath, realCandidate);
    return fs.readFile(realCandidate);
  }

  private async readPackage(
    requestedPath: string,
  ): Promise<DiscoveredExtensionPackage> {
    const root = await realpathOrHostError(
      this.rootPath,
      "Configured extension package root is unavailable",
    );
    const packagePath = await realpathOrHostError(
      requestedPath,
      "Extension package directory is unavailable",
    );
    assertContained(root, packagePath);
    const packageStats = await fs.stat(packagePath);
    if (!packageStats.isDirectory())
      throw new ExtensionHostError(
        "Extension package must be a directory",
        "INVALID_PACKAGE",
      );

    const manifestPath = path.join(packagePath, PACKAGE_MANIFEST_FILE);
    const manifestContents = await fs
      .readFile(manifestPath, "utf8")
      .catch((error: unknown) => {
        throw new ExtensionHostError(
          "Extension package manifest is unavailable",
          "INVALID_PACKAGE",
          error,
        );
      });
    let packageManifest: ExtensionPackageManifest;
    try {
      packageManifest = parseExtensionPackageManifest(
        JSON.parse(manifestContents) as unknown,
      );
    } catch (error) {
      throw new ExtensionHostError(
        "Extension package manifest is invalid",
        "INVALID_PACKAGE",
        error,
      );
    }
    const entrypointPath = path.resolve(
      packagePath,
      packageManifest.entrypoint,
    );
    assertContained(packagePath, entrypointPath);
    const entrypointRealPath = await realpathOrHostError(
      entrypointPath,
      "Extension entrypoint is unavailable",
    );
    assertContained(packagePath, entrypointRealPath);
    const computedChecksum = await calculatePackageChecksum(
      packagePath,
      manifestPath,
    );
    return {
      packagePath,
      manifestPath,
      entrypointPath: entrypointRealPath,
      packageManifest,
      computedChecksum,
    };
  }
}

function readExtensionModule(imported: unknown): ExtensionModule {
  if (!isRecord(imported))
    throw new ExtensionHostError(
      "Extension entrypoint must export a module object",
      "INVALID_PACKAGE",
    );
  const candidate = isRecord(imported.default) ? imported.default : imported;
  if (!("manifest" in candidate))
    throw new ExtensionHostError(
      "Extension module must export a manifest",
      "INVALID_PACKAGE",
    );
  return {
    manifest: parseExtensionManifest(candidate.manifest),
    commandHandlers: readCommandHandlers(candidate),
    onInstall: readLifecycle(candidate, "onInstall"),
    onActivate: readLifecycle(candidate, "onActivate"),
    onDeactivate: readLifecycle(candidate, "onDeactivate"),
    onUninstall: readLifecycle(candidate, "onUninstall"),
  };
}

function readCommandHandlers(
  candidate: Record<string, unknown>,
): Readonly<Record<string, ExtensionCommandHandler>> | undefined {
  const value = candidate.commandHandlers;
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new ExtensionHostError(
      "Extension commandHandlers must be an object",
      "INVALID_PACKAGE",
    );
  }
  const handlers: Record<string, ExtensionCommandHandler> = {};
  for (const [commandId, handler] of Object.entries(value)) {
    if (typeof handler !== "function") {
      throw new ExtensionHostError(
        `Extension command handler ${commandId} must be a function`,
        "INVALID_PACKAGE",
      );
    }
    handlers[commandId] = handler as ExtensionCommandHandler;
  }
  return handlers;
}

type LifecycleName =
  "onInstall" | "onActivate" | "onDeactivate" | "onUninstall";
type LifecycleHandler = (
  context: ExtensionLifecycleContext,
) => void | Promise<void>;

function readLifecycle(
  candidate: Record<string, unknown>,
  name: LifecycleName,
): LifecycleHandler | undefined {
  const value = candidate[name];
  if (value === undefined) return undefined;
  if (typeof value !== "function")
    throw new ExtensionHostError(
      `Extension lifecycle ${name} must be a function`,
      "INVALID_PACKAGE",
    );
  return value as LifecycleHandler;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function realpathOrHostError(
  candidate: string,
  message: string,
): Promise<string> {
  try {
    return await fs.realpath(candidate);
  } catch (error) {
    throw new ExtensionHostError(message, "INVALID_PACKAGE", error);
  }
}

function assertContained(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  )
    return;
  throw new ExtensionHostError(
    "Extension package path escapes configured root",
    "PACKAGE_OUTSIDE_ROOT",
  );
}

async function calculatePackageChecksum(
  packagePath: string,
  manifestPath: string,
): Promise<string> {
  const files = await listRegularFiles(packagePath);
  const hash = createHash("sha256");
  for (const filePath of files) {
    if (filePath === manifestPath) continue;
    const relative = path
      .relative(packagePath, filePath)
      .split(path.sep)
      .join("/");
    hash.update(relative);
    hash.update("\0");
    hash.update(await fs.readFile(filePath));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

async function listRegularFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new ExtensionHostError(
        "Extension packages may not contain symbolic links",
        "INVALID_PACKAGE",
      );
    if (entry.isDirectory()) files.push(...(await listRegularFiles(entryPath)));
    else if (entry.isFile()) files.push(entryPath);
    else
      throw new ExtensionHostError(
        "Extension packages may contain only regular files",
        "INVALID_PACKAGE",
      );
  }
  return files;
}
