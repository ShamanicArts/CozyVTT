import { FileSystemAssetContentStore } from "../adapters/assets/FileSystemAssetContentStore";
import { PrismaAssetQueryRepository } from "../adapters/persistence/PrismaAssetQueryRepository";
import { AssetQueries } from "../application/assets/AssetQueries";
import { prisma } from "../config/database";

export const productionAssetQueries = new AssetQueries(
  new PrismaAssetQueryRepository(prisma),
  new FileSystemAssetContentStore(),
);
