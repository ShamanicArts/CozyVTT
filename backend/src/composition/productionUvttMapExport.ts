import { NodeUvttExportRenderer } from "../adapters/assets/NodeUvttExportRenderer";
import { PrismaUvttMapExportRepository } from "../adapters/persistence/PrismaUvttMapExportRepository";
import { UvttMapExport } from "../application/maps/UvttMapExport";
import { prisma } from "../config/database";

export const productionUvttMapExport = new UvttMapExport(
  new PrismaUvttMapExportRepository(prisma),
  new NodeUvttExportRenderer(),
);
