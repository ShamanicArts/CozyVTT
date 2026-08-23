import type {
  TokenTemplateQuery,
  TokenTemplateQueryRepository,
} from "../../ports/TokenTemplateQueryRepository";

export class TokenTemplateQueryError extends Error {
  constructor(
    readonly status: 403 | 404,
    readonly error: "Forbidden" | "Not Found",
    message: string,
  ) {
    super(message);
    this.name = "TokenTemplateQueryError";
  }
}

export class TokenTemplateQueries {
  constructor(private readonly templates: TokenTemplateQueryRepository) {}

  async list(input: TokenTemplateQuery) {
    const result = await this.templates.list(input);
    return { ...result, limit: input.limit, offset: input.offset };
  }

  async find(campaignId: string, id: string) {
    const template = await this.templates.find(id);
    if (!template)
      throw new TokenTemplateQueryError(
        404,
        "Not Found",
        "Token template not found",
      );
    if (template.campaignId !== campaignId)
      throw new TokenTemplateQueryError(
        403,
        "Forbidden",
        "Token template belongs to another campaign",
      );
    return template;
  }
}
