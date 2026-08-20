import { NewTokenTemplate, TokenTemplate } from '../domain/tokenTemplates/TokenTemplate';

/** Persistence boundary for reusable token definitions. */
export interface TokenTemplateRepository {
  create(template: NewTokenTemplate): Promise<TokenTemplate>;
}
