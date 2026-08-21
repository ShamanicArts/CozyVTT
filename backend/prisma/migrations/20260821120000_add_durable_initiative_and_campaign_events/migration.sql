ALTER TABLE "Campaign"
ADD COLUMN "initiativeState" JSONB NOT NULL DEFAULT '{"active":false,"round":0,"currentTokenId":null,"combatants":[]}',
ADD COLUMN "initiativeRevision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CampaignEventRecord" (
    "sequence" BIGSERIAL NOT NULL,
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "actorId" TEXT,
    "correlationId" TEXT NOT NULL,
    "causationId" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "recipientIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignEventRecord_pkey" PRIMARY KEY ("sequence")
);

CREATE UNIQUE INDEX "CampaignEventRecord_id_key" ON "CampaignEventRecord"("id");
CREATE INDEX "campaign_event_campaign_sequence_idx" ON "CampaignEventRecord"("campaignId", "sequence");
CREATE INDEX "campaign_event_campaign_type_sequence_idx" ON "CampaignEventRecord"("campaignId", "type", "sequence");

ALTER TABLE "CampaignEventRecord"
ADD CONSTRAINT "CampaignEventRecord_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
