import { Prisma, PrismaClient } from "@prisma/client";
import { UvttMapImportRepository } from "../../ports/UvttMapImportRepository";
export class PrismaUvttMapImportRepository implements UvttMapImportRepository {
  constructor(private readonly client: PrismaClient) {}
  async createAsset(data: Record<string, unknown>) {
    return this.client.asset.create({
      data: data as Prisma.AssetUncheckedCreateInput,
      select: { id: true },
    });
  }
  async createMap(data: Record<string, unknown>) {
    return this.client.map.create({
      data: data as Prisma.MapUncheckedCreateInput,
    }) as unknown as Record<string, unknown>;
  }
}
