import {
  NewTokenTemplate,
  TokenTemplate,
} from "../domain/tokenTemplates/TokenTemplate";

/** Persistence boundary for reusable token definitions. */
export interface TokenTemplateRepository {
  create(template: NewTokenTemplate): Promise<TokenTemplate>;
  find(id: string): Promise<TokenTemplate | null>;
  update(id: string, data: Partial<NewTokenTemplate>): Promise<TokenTemplate>;
  delete(id: string): Promise<void>;
  targetCampaignIsDm(userId: string, campaignId: string): Promise<boolean>;
  campaignExists(campaignId: string): Promise<boolean>;
}
