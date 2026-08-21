import { PrismaCampaignEventJournal } from "../adapters/persistence/PrismaCampaignEventJournal";
import { productionPrisma } from "./productionTransactionContext";

export const productionCampaignEventJournal =
  new PrismaCampaignEventJournal(productionPrisma);
