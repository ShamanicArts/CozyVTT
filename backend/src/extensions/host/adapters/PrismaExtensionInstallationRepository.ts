import {
  Prisma,
  PrismaClient,
  ExtensionInstallationState as PrismaInstallationState,
  ExtensionInstallMode as PrismaInstallMode,
} from "@prisma/client";
import type {
  ExtensionInstallation,
  ExtensionInstallationState,
} from "../contracts";
import type { ExtensionInstallationRepository } from "../ports";
import { parseExtensionPackageManifest } from "../schemas";

export class PrismaExtensionInstallationRepository implements ExtensionInstallationRepository {
  public constructor(private readonly client: PrismaClient) {}

  public async find(
    extensionId: string,
  ): Promise<ExtensionInstallation | null> {
    const record = await this.client.extensionInstallation.findUnique({
      where: { extensionId },
    });
    return record ? toInstallation(record) : null;
  }

  public async list(): Promise<ExtensionInstallation[]> {
    const records = await this.client.extensionInstallation.findMany({
      orderBy: { extensionId: "asc" },
    });
    return records.map(toInstallation);
  }

  public async save(input: {
    extensionId: string;
    version: string;
    packagePath: string;
    packageChecksum: string;
    installMode: ExtensionInstallation["installMode"];
    packageManifest: ExtensionInstallation["packageManifest"];
    state: ExtensionInstallationState;
    lastError: string | null;
    activatedAt: Date | null;
  }): Promise<ExtensionInstallation> {
    const data = {
      version: input.version,
      packagePath: input.packagePath,
      packageChecksum: input.packageChecksum,
      installMode:
        input.installMode === "sandboxed"
          ? PrismaInstallMode.SANDBOXED
          : PrismaInstallMode.TRUSTED,
      manifestJson: input.packageManifest as unknown as Prisma.InputJsonValue,
      state: toPrismaState(input.state),
      lastError: input.lastError,
      activatedAt: input.activatedAt,
    };
    const record = await this.client.extensionInstallation.upsert({
      where: { extensionId: input.extensionId },
      create: { extensionId: input.extensionId, ...data },
      update: data,
    });
    return toInstallation(record);
  }

  public async remove(extensionId: string): Promise<void> {
    await this.client.extensionInstallation.delete({ where: { extensionId } });
  }
}

type PrismaInstallation = {
  extensionId: string;
  version: string;
  packagePath: string;
  packageChecksum: string;
  installMode: PrismaInstallMode;
  manifestJson: Prisma.JsonValue;
  state: PrismaInstallationState;
  lastError: string | null;
  installedAt: Date;
  activatedAt: Date | null;
  updatedAt: Date;
};

function toInstallation(record: PrismaInstallation): ExtensionInstallation {
  return {
    extensionId: record.extensionId,
    version: record.version,
    packagePath: record.packagePath,
    packageChecksum: record.packageChecksum,
    installMode:
      record.installMode === PrismaInstallMode.SANDBOXED
        ? "sandboxed"
        : "trusted",
    packageManifest: parseExtensionPackageManifest(record.manifestJson),
    state: fromPrismaState(record.state),
    lastError: record.lastError,
    installedAt: record.installedAt,
    activatedAt: record.activatedAt,
    updatedAt: record.updatedAt,
  };
}

function toPrismaState(
  state: ExtensionInstallationState,
): PrismaInstallationState {
  switch (state) {
    case "installed":
      return PrismaInstallationState.INSTALLED;
    case "active":
      return PrismaInstallationState.ACTIVE;
    case "error":
      return PrismaInstallationState.ERROR;
  }
}

function fromPrismaState(
  state: PrismaInstallationState,
): ExtensionInstallationState {
  switch (state) {
    case PrismaInstallationState.INSTALLED:
      return "installed";
    case PrismaInstallationState.ACTIVE:
      return "active";
    case PrismaInstallationState.ERROR:
      return "error";
  }
}
