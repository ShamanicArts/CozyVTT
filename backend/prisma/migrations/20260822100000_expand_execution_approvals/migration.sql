ALTER TYPE "AgentConfirmationState" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "AgentConfirmationState" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "AgentConfirmation"
  ADD COLUMN "displayMetadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancellationReason" TEXT;

ALTER TABLE "AgentConfirmation"
  ALTER COLUMN "displayMetadata" DROP DEFAULT;
