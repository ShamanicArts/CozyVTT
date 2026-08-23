import { PrismaInvitationQueryRepository } from "../adapters/persistence/PrismaInvitationQueryRepository";
import { InvitationQueries } from "../application/campaigns/InvitationQueries";
import { prisma } from "../config/database";

export const productionInvitationQueries = new InvitationQueries(
  new PrismaInvitationQueryRepository(prisma),
);
