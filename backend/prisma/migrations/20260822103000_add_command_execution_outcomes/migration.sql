CREATE TABLE "CommandExecutionOutcome" (
  "id" TEXT NOT NULL,
  "principalType" "ExtensionPrincipalType" NOT NULL,
  "principalId" TEXT NOT NULL,
  "scopeCampaignId" TEXT NOT NULL DEFAULT '',
  "commandType" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestDigest" TEXT NOT NULL,
  "capabilityVersion" TEXT NOT NULL,
  "status" "IdempotencyStatus" NOT NULL,
  "resultJson" JSONB,
  "resultDigest" TEXT,
  "publicErrorCode" TEXT,
  "publicErrorMessage" TEXT,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommandExecutionOutcome_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommandExecutionOutcome_principalType_principalId_scopeCampaignId_commandType_idempotencyKey_key"
  ON "CommandExecutionOutcome"("principalType", "principalId", "scopeCampaignId", "commandType", "idempotencyKey");
CREATE INDEX "CommandExecutionOutcome_expiresAt_idx" ON "CommandExecutionOutcome"("expiresAt");
