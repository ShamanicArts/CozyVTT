import { Prisma, PrismaClient } from "@prisma/client";
import { CampaignSessionRecord } from "../../domain/campaigns/SessionLifecycle";
import { CampaignSessionRepository } from "../../ports/CampaignSessionRepository";

/** Prisma implementation of the campaign session lifecycle persistence port. */
export class PrismaCampaignSessionRepository implements CampaignSessionRepository {
  constructor(private readonly client: PrismaClient) {}

  findCampaignStatus(campaignId: string): Promise<{ status: string } | null> {
    return this.client.campaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    });
  }

  async nextSessionNumber(campaignId: string): Promise<number> {
    const last = await this.client.session.findFirst({
      where: { campaignId },
      orderBy: { sessionNumber: "desc" },
      select: { sessionNumber: true },
    });
    return (last?.sessionNumber || 0) + 1;
  }

  async createSession(
    campaignId: string,
    sessionNumber: number,
  ): Promise<CampaignSessionRecord> {
    const session = await this.client.session.create({
      data: { campaignId, sessionNumber },
    });
    return session as unknown as CampaignSessionRecord;
  }

  async findSession(
    campaignId: string,
    sessionId: string,
  ): Promise<CampaignSessionRecord | null> {
    const session = await this.client.session.findFirst({
      where: { id: sessionId, campaignId },
    });
    return session as unknown as CampaignSessionRecord | null;
  }

  async findLastSession(
    campaignId: string,
  ): Promise<CampaignSessionRecord | null> {
    const session = await this.client.session.findFirst({
      where: { campaignId },
      orderBy: { startedAt: "desc" },
    });
    return session as unknown as CampaignSessionRecord | null;
  }

  async saveSessionState(sessionId: string, state: unknown): Promise<void> {
    await this.client.session.update({
      where: { id: sessionId },
      data: { savedState: state as Prisma.InputJsonValue },
    });
  }

  async endSession(
    sessionId: string,
    data: { endedAt: Date; savedState: unknown | null; notes?: string },
  ): Promise<void> {
    await this.client.session.update({
      where: { id: sessionId },
      data: {
        endedAt: data.endedAt,
        savedState: data.savedState as Prisma.InputJsonValue,
        ...(data.notes ? { notes: data.notes } : {}),
      },
    });
  }

  async reopenSession(sessionId: string): Promise<void> {
    await this.client.session.update({
      where: { id: sessionId },
      data: { endedAt: null },
    });
  }

  async updateCampaignStatus(
    campaignId: string,
    status: "ACTIVE" | "PAUSED" | "INACTIVE",
    lastPlayedAt?: Date,
  ): Promise<void> {
    await this.client.campaign.update({
      where: { id: campaignId },
      data: { status, ...(lastPlayedAt ? { lastPlayedAt } : {}) },
    });
  }
}
