import { prisma } from "../config/database";
import { PrismaCampaignQueryRepository } from "../adapters/persistence/PrismaCampaignQueryRepository";
import { CampaignQueries } from "../application/queries/CampaignQueries";
import { QueryHost } from "../application/queries/QueryHost";
import { AgentCampaignQueries } from "../application/queries/AgentCampaignQueries";
import { PrismaCampaignSnapshotRepository } from "../adapters/persistence/PrismaCampaignSnapshotRepository";
import { productionCampaignEventJournal } from "./productionCampaignEventJournal";

export const productionQueryHost = new QueryHost();
const campaignQueries = new PrismaCampaignQueryRepository(prisma);
for (const query of new CampaignQueries(campaignQueries).all())
  productionQueryHost.register(query);
for (const query of new AgentCampaignQueries(
  campaignQueries,
  new PrismaCampaignSnapshotRepository(prisma),
  productionCampaignEventJournal,
).all())
  productionQueryHost.register(query);
