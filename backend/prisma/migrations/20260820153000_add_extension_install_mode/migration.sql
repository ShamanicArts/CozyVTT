CREATE TYPE "ExtensionInstallMode" AS ENUM ('TRUSTED', 'SANDBOXED');
ALTER TABLE "ExtensionInstallation" ADD COLUMN "installMode" "ExtensionInstallMode" NOT NULL DEFAULT 'TRUSTED';
