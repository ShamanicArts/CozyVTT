import { prisma } from "../config/database";
import { PrismaCampaignQueryRepository } from "../adapters/persistence/PrismaCampaignQueryRepository";
import { CampaignQueries } from "../application/queries/CampaignQueries";
import { QueryHost } from "../application/queries/QueryHost";
export const productionQueryHost = new QueryHost();
for (const query of new CampaignQueries(
  new PrismaCampaignQueryRepository(prisma),
).all())
  productionQueryHost.register(query);
