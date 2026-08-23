import { prisma } from "../config/database";
import { PrismaCampaignQueryRepository } from "../adapters/persistence/PrismaCampaignQueryRepository";
import { CampaignQueries } from "../application/queries/CampaignQueries";
import { QueryHost } from "../application/queries/QueryHost";
import { PublicCampaignQueries } from "../application/queries/PublicCampaignQueries";
import { PrismaCampaignSnapshotRepository } from "../adapters/persistence/PrismaCampaignSnapshotRepository";
import { productionCampaignEventJournal } from "./productionCampaignEventJournal";
import { productionRealtimeQueries } from "./productionRealtimeQueries";
import { CampaignHttpQueries } from "../application/campaigns/CampaignHttpQueries";

export const productionQueryHost = new QueryHost();
export const productionPublicQueryHost = new QueryHost();
const campaignQueries = new PrismaCampaignQueryRepository(prisma);
export const productionCampaignHttpQueries = new CampaignHttpQueries(campaignQueries);
for (const query of new CampaignQueries(campaignQueries).all())
  productionQueryHost.register(query);
const publicQueries = new PublicCampaignQueries(
  campaignQueries,
  new PrismaCampaignSnapshotRepository(prisma, productionRealtimeQueries),
  productionCampaignEventJournal,
).all();
for (const query of publicQueries) {
  productionQueryHost.register(query);
  productionPublicQueryHost.register(query);
}
