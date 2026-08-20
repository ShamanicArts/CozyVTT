CREATE TYPE "AgentConfirmationState" AS ENUM ('PENDING', 'APPROVED', 'CONSUMED', 'EXPIRED');

CREATE TABLE "AgentCredential" (
  "id" TEXT NOT NULL,
  "credentialHash" TEXT NOT NULL,
  "delegatedUserId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentCredential_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgentCredential_credentialHash_key" ON "AgentCredential"("credentialHash");
CREATE INDEX "AgentCredential_delegatedUserId_campaignId_idx" ON "AgentCredential"("delegatedUserId", "campaignId");
CREATE INDEX "AgentCredential_expiresAt_idx" ON "AgentCredential"("expiresAt");

CREATE TABLE "AgentConfirmation" (
  "id" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "delegatedUserId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "extensionId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "inputDigest" TEXT NOT NULL,
  "state" "AgentConfirmationState" NOT NULL DEFAULT 'PENDING',
  "receiptHash" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentConfirmation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgentConfirmation_receiptHash_key" ON "AgentConfirmation"("receiptHash");
CREATE INDEX "AgentConfirmation_credentialId_campaignId_state_expiresAt_idx" ON "AgentConfirmation"("credentialId", "campaignId", "state", "expiresAt");
CREATE INDEX "AgentConfirmation_delegatedUserId_state_expiresAt_idx" ON "AgentConfirmation"("delegatedUserId", "state", "expiresAt");
