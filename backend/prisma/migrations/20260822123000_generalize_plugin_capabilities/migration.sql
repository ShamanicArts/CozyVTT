ALTER TYPE "ExtensionPrincipalType" RENAME VALUE 'AGENT' TO 'PLUGIN';

ALTER TYPE "AgentConfirmationState" RENAME TO "CapabilityApprovalState";
ALTER TABLE "AgentConfirmation" RENAME TO "CapabilityApproval";
ALTER TABLE "CapabilityApproval"
  RENAME CONSTRAINT "AgentConfirmation_pkey" TO "CapabilityApproval_pkey";
ALTER INDEX "AgentConfirmation_receiptHash_key"
  RENAME TO "CapabilityApproval_receiptHash_key";
ALTER INDEX "AgentConfirmation_credentialId_campaignId_state_expiresAt_idx"
  RENAME TO "CapabilityApproval_credentialId_campaignId_state_expiresAt_idx";
ALTER INDEX "AgentConfirmation_delegatedUserId_state_expiresAt_idx"
  RENAME TO "CapabilityApproval_delegatedUserId_state_expiresAt_idx";

ALTER TYPE "AgentAuditDecision" RENAME TO "CapabilityAuditDecision";
ALTER TABLE "AgentAuditRecord" RENAME TO "CapabilityAuditRecord";
ALTER TABLE "CapabilityAuditRecord"
  RENAME CONSTRAINT "AgentAuditRecord_pkey" TO "CapabilityAuditRecord_pkey";
ALTER INDEX "AgentAuditRecord_principalType_principalId_createdAt_idx"
  RENAME TO "CapabilityAuditRecord_principalType_principalId_createdAt_idx";
ALTER INDEX "AgentAuditRecord_campaignId_createdAt_idx"
  RENAME TO "CapabilityAuditRecord_campaignId_createdAt_idx";
ALTER INDEX "AgentAuditRecord_correlationId_idx"
  RENAME TO "CapabilityAuditRecord_correlationId_idx";

UPDATE "CapabilityApproval"
SET "commandId" = regexp_replace("commandId", '^agent\.', 'vtt.'),
    "extensionId" = CASE
      WHEN "extensionId" = 'cozyvtt.core-agent' THEN 'cozyvtt.public-capabilities'
      ELSE "extensionId"
    END
WHERE "commandId" LIKE 'agent.%'
   OR "extensionId" = 'cozyvtt.core-agent';

UPDATE "CapabilityAuditRecord"
SET "commandType" = regexp_replace("commandType", '^agent\.', 'vtt.'),
    "extensionId" = CASE
      WHEN "extensionId" = 'cozyvtt.core-agent' THEN 'cozyvtt.public-capabilities'
      ELSE "extensionId"
    END
WHERE "commandType" LIKE 'agent.%'
   OR "extensionId" = 'cozyvtt.core-agent';

UPDATE "CommandIdempotencyRecord"
SET "commandType" = regexp_replace("commandType", '^agent\.', 'vtt.')
WHERE "commandType" LIKE 'agent.%';

UPDATE "ExtensionGrant"
SET "extensionId" = 'cozyvtt.public-capabilities'
WHERE "extensionId" = 'cozyvtt.core-agent';

-- Preserve installed extension manifests while adopting the public publication
-- contract and neutral command namespace.
UPDATE "ExtensionInstallation"
SET "manifestJson" =
  jsonb_set(
    jsonb_set(
      "manifestJson" - 'agentTools',
      '{publishedCapabilities}',
      COALESCE(
        (
          SELECT jsonb_agg(
            CASE
              WHEN publication ? 'commandId' THEN jsonb_set(
                publication,
                '{commandId}',
                to_jsonb(regexp_replace(publication->>'commandId', '^agent\.', 'vtt.'))
              )
              ELSE publication
            END
          )
          FROM jsonb_array_elements(
            COALESCE("manifestJson"->'publishedCapabilities', "manifestJson"->'agentTools', '[]'::jsonb)
          ) AS publication
        ),
        '[]'::jsonb
      ),
      true
    ),
    '{capabilities}',
    COALESCE(
      (
        SELECT jsonb_agg(
          CASE
            WHEN capability = '"agent-tools"'::jsonb
              THEN '"capability-publications"'::jsonb
            ELSE capability
          END
        )
        FROM jsonb_array_elements(COALESCE("manifestJson"->'capabilities', '[]'::jsonb)) AS capability
      ),
      '[]'::jsonb
    ),
    true
  );

UPDATE "ExtensionInstallation"
SET "manifestJson" = jsonb_set(
  "manifestJson",
  '{commands}',
  COALESCE(
    (
      SELECT jsonb_agg(
        CASE
          WHEN command ? 'id' THEN jsonb_set(
            command,
            '{id}',
            to_jsonb(regexp_replace(command->>'id', '^agent\.', 'vtt.'))
          )
          ELSE command
        END
      )
      FROM jsonb_array_elements(COALESCE("manifestJson"->'commands', '[]'::jsonb)) AS command
    ),
    '[]'::jsonb
  ),
  true
);
