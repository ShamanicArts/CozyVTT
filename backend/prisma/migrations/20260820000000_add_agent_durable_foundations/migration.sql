-- Durable extension/agent foundations. No grants are seeded: access defaults
-- to denial until an explicit grant is created.
CREATE TYPE "ExtensionPrincipalType" AS ENUM ('USER', 'AGENT', 'SYSTEM');
CREATE TYPE "ExtensionPermission" AS ENUM ('READ', 'WRITE', 'EXECUTE', 'ADMIN');
CREATE TYPE "AgentAuditDecision" AS ENUM ('ALLOWED', 'DENIED', 'EXECUTED', 'FAILED');
CREATE TYPE "IdempotencyStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'CLAIMED', 'DELIVERED', 'DEAD_LETTER');

CREATE TABLE "ExtensionGrant" (
  "id" TEXT NOT NULL, "principalType" "ExtensionPrincipalType" NOT NULL, "principalId" TEXT NOT NULL,
  "scopeCampaignId" TEXT NOT NULL DEFAULT '', "extensionId" TEXT NOT NULL, "permission" "ExtensionPermission" NOT NULL,
  "grantedById" TEXT, "expiresAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ExtensionGrant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ext_grant_principal_scope_permission_uq" ON "ExtensionGrant"("principalType","principalId","scopeCampaignId","extensionId","permission");
CREATE INDEX "ext_grant_principal_scope_lookup_ix" ON "ExtensionGrant"("principalType","principalId","scopeCampaignId","extensionId");
CREATE INDEX "ExtensionGrant_expiresAt_idx" ON "ExtensionGrant"("expiresAt");

CREATE TABLE "AgentAuditRecord" (
  "id" TEXT NOT NULL, "principalType" "ExtensionPrincipalType" NOT NULL, "principalId" TEXT NOT NULL, "delegatedIdentity" TEXT,
  "campaignId" TEXT, "extensionId" TEXT, "commandType" TEXT NOT NULL, "inputDigest" TEXT NOT NULL, "decision" "AgentAuditDecision" NOT NULL,
  "reasonCode" TEXT, "correlationId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentAuditRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AgentAuditRecord_principalType_principalId_createdAt_idx" ON "AgentAuditRecord"("principalType","principalId","createdAt");
CREATE INDEX "AgentAuditRecord_campaignId_createdAt_idx" ON "AgentAuditRecord"("campaignId","createdAt");
CREATE INDEX "AgentAuditRecord_correlationId_idx" ON "AgentAuditRecord"("correlationId");

CREATE TABLE "CommandIdempotencyRecord" (
  "id" TEXT NOT NULL, "principalType" "ExtensionPrincipalType" NOT NULL, "principalId" TEXT NOT NULL, "scopeCampaignId" TEXT NOT NULL DEFAULT '',
  "commandType" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "requestDigest" TEXT NOT NULL, "status" "IdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
  "resultDigest" TEXT, "claimToken" TEXT, "leaseExpiresAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommandIdempotencyRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "command_idempotency_scope_key_uq" ON "CommandIdempotencyRecord"("principalType","principalId","scopeCampaignId","commandType","idempotencyKey");
CREATE INDEX "command_idempotency_claimable_ix" ON "CommandIdempotencyRecord"("status","leaseExpiresAt");
CREATE INDEX "CommandIdempotencyRecord_expiresAt_idx" ON "CommandIdempotencyRecord"("expiresAt");

CREATE TABLE "OutboxEvent" (
  "id" TEXT NOT NULL, "topic" TEXT NOT NULL, "aggregateType" TEXT NOT NULL, "aggregateId" TEXT NOT NULL, "campaignId" TEXT,
  "payload" JSONB NOT NULL, "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "claimedBy" TEXT, "claimToken" TEXT, "claimedAt" TIMESTAMP(3),
  "leaseExpiresAt" TIMESTAMP(3), "deliveredAt" TIMESTAMP(3), "deadLetteredAt" TIMESTAMP(3), "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OutboxEvent_status_availableAt_leaseExpiresAt_idx" ON "OutboxEvent"("status","availableAt","leaseExpiresAt");
CREATE INDEX "OutboxEvent_campaignId_createdAt_idx" ON "OutboxEvent"("campaignId","createdAt");
CREATE INDEX "OutboxEvent_aggregateType_aggregateId_idx" ON "OutboxEvent"("aggregateType","aggregateId");
