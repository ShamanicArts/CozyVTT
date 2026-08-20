-- Persistent reviewed-package inventory for the trusted extension host.
CREATE TYPE "ExtensionInstallationState" AS ENUM ('INSTALLED', 'ACTIVE', 'ERROR');

CREATE TABLE "ExtensionInstallation" (
    "id" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "packagePath" TEXT NOT NULL,
    "packageChecksum" TEXT NOT NULL,
    "manifestJson" JSONB NOT NULL,
    "state" "ExtensionInstallationState" NOT NULL DEFAULT 'INSTALLED',
    "lastError" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtensionInstallation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExtensionInstallation_extensionId_key" ON "ExtensionInstallation"("extensionId");
CREATE INDEX "ExtensionInstallation_state_idx" ON "ExtensionInstallation"("state");
