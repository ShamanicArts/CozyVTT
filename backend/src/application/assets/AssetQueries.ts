import type {
  AssetContentStore,
  AssetQueryInput,
  AssetQueryRecord,
  AssetQueryRepository,
} from "../../ports/AssetQueryRepository";

export class AssetQueryError extends Error {
  constructor(
    readonly status: 403 | 404,
    readonly error: "Forbidden" | "Not Found",
    message: string,
  ) {
    super(message);
    this.name = "AssetQueryError";
  }
}

export class AssetQueries {
  constructor(
    private readonly assets: AssetQueryRepository,
    private readonly content: AssetContentStore,
  ) {}

  async list(input: AssetQueryInput) {
    let result;
    try {
      result = await this.assets.list(input);
    } catch (error) {
      if (error instanceof Error && error.message === "ASSET_CAMPAIGN_FORBIDDEN")
        throw new AssetQueryError(
          403,
          "Forbidden",
          "You do not have access to this campaign",
        );
      throw error;
    }
    return {
      assets: result.assets,
      pagination: {
        page: input.page,
        limit: input.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / input.limit),
      },
    };
  }

  async metadata(actor: { userId: string; isAdmin: boolean }, id: string) {
    return this.authorized(actor, id);
  }

  async file(
    actor: { userId: string; isAdmin: boolean },
    id: string,
    options: { type?: string; missingAsset: string; missingFile: string },
  ) {
    const asset = await this.authorized(actor, id, options.type, options.missingAsset);
    const contents = await this.content.read(asset.filePath);
    if (!contents)
      throw new AssetQueryError(404, "Not Found", options.missingFile);
    return { asset, contents };
  }

  async avatar(userId: string) {
    const asset = await this.assets.latestAvatar(userId);
    if (!asset)
      throw new AssetQueryError(404, "Not Found", "User avatar not found");
    const contents = await this.content.read(asset.filePath);
    if (!contents)
      throw new AssetQueryError(
        404,
        "Not Found",
        "Avatar file not found on server",
      );
    return { asset, contents };
  }

  createThumbnail(filePath: string, filename: string) {
    return this.content.createThumbnail(filePath, filename);
  }

  private async authorized(
    actor: { userId: string; isAdmin: boolean },
    id: string,
    type?: string,
    missingMessage = "Asset not found",
  ): Promise<AssetQueryRecord> {
    const asset = await this.assets.find(id, type);
    if (!asset)
      throw new AssetQueryError(404, "Not Found", missingMessage);
    const allowed =
      actor.isAdmin ||
      asset.scope === "GLOBAL" ||
      (asset.scope === "USER" && asset.uploadedById === actor.userId) ||
      (asset.scope === "CAMPAIGN" &&
        asset.campaignId != null &&
        (await this.assets.isCampaignMember(actor.userId, asset.campaignId)));
    if (!allowed)
      throw new AssetQueryError(
        403,
        "Forbidden",
        "You do not have access to this asset",
      );
    return asset;
  }
}
