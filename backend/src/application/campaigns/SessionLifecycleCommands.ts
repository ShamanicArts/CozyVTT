import {
  CampaignSessionRecord,
  SessionLifecycleError,
} from "../../domain/campaigns/SessionLifecycle";
import { CampaignSessionRepository } from "../../ports/CampaignSessionRepository";
import { CampaignSessionState } from "../../ports/CampaignSessionState";
import { Command, CommandHandler } from "../commands/CommandBus";

export const START_CAMPAIGN_SESSION = "campaign.session.start" as const;
export const PAUSE_CAMPAIGN_SESSION = "campaign.session.pause" as const;
export const END_CAMPAIGN_SESSION = "campaign.session.end" as const;
export const RESUME_CAMPAIGN_SESSION = "campaign.session.resume" as const;

export interface StartCampaignSessionCommand extends Command<CampaignSessionRecord> {
  readonly type: typeof START_CAMPAIGN_SESSION;
  readonly campaignId: string;
}

export interface PauseCampaignSessionCommand extends Command<CampaignSessionRecord> {
  readonly type: typeof PAUSE_CAMPAIGN_SESSION;
  readonly campaignId: string;
  readonly sessionId: string;
}

export interface EndCampaignSessionCommand extends Command<{
  session: CampaignSessionRecord;
  stateSaved: unknown;
}> {
  readonly type: typeof END_CAMPAIGN_SESSION;
  readonly campaignId: string;
  readonly sessionId: string;
  readonly saveState: unknown;
  readonly notes: unknown;
}

export interface ResumeCampaignSessionCommand extends Command<CampaignSessionRecord> {
  readonly type: typeof RESUME_CAMPAIGN_SESSION;
  readonly campaignId: string;
}

abstract class SessionCommandBase {
  constructor(
    protected readonly repository: CampaignSessionRepository,
    protected readonly state: CampaignSessionState,
  ) {}

  protected async sessionInCampaign(
    campaignId: string,
    sessionId: string,
  ): Promise<CampaignSessionRecord> {
    const session = await this.repository.findSession(campaignId, sessionId);
    if (!session)
      throw new SessionLifecycleError(404, "Not Found", "Session not found");
    if (session.endedAt)
      throw new SessionLifecycleError(
        400,
        "Bad Request",
        "Session has already ended",
      );
    return session;
  }
}

export class StartCampaignSession
  extends SessionCommandBase
  implements CommandHandler<StartCampaignSessionCommand, CampaignSessionRecord>
{
  async execute(
    command: StartCampaignSessionCommand,
  ): Promise<CampaignSessionRecord> {
    const campaign = await this.repository.findCampaignStatus(
      command.campaignId,
    );
    if (!campaign)
      throw new SessionLifecycleError(404, "Not Found", "Campaign not found");
    if (campaign.status === "ACTIVE") {
      throw new SessionLifecycleError(
        400,
        "Bad Request",
        "A session is already active. Please end or pause the current session first.",
      );
    }
    const sessionNumber = await this.repository.nextSessionNumber(
      command.campaignId,
    );
    const session = await this.repository.createSession(
      command.campaignId,
      sessionNumber,
    );
    await this.repository.updateCampaignStatus(
      command.campaignId,
      "ACTIVE",
      new Date(),
    );
    return session;
  }
}

export class PauseCampaignSession
  extends SessionCommandBase
  implements CommandHandler<PauseCampaignSessionCommand, CampaignSessionRecord>
{
  async execute(
    command: PauseCampaignSessionCommand,
  ): Promise<CampaignSessionRecord> {
    const session = await this.sessionInCampaign(
      command.campaignId,
      command.sessionId,
    );
    const state = await this.state.capture(
      command.campaignId,
      command.sessionId,
    );
    await this.repository.saveSessionState(command.sessionId, state);
    await this.repository.updateCampaignStatus(command.campaignId, "PAUSED");
    return session;
  }
}

export class EndCampaignSession
  extends SessionCommandBase
  implements
    CommandHandler<
      EndCampaignSessionCommand,
      { session: CampaignSessionRecord; stateSaved: unknown }
    >
{
  async execute(
    command: EndCampaignSessionCommand,
  ): Promise<{ session: CampaignSessionRecord; stateSaved: unknown }> {
    const session = await this.sessionInCampaign(
      command.campaignId,
      command.sessionId,
    );
    const savedState = command.saveState
      ? await this.state.capture(command.campaignId, command.sessionId)
      : null;
    const notes = command.notes
      ? String(command.notes).slice(0, 2000)
      : undefined;
    await this.repository.endSession(command.sessionId, {
      endedAt: new Date(),
      savedState,
      ...(notes ? { notes } : {}),
    });
    await this.repository.updateCampaignStatus(command.campaignId, "INACTIVE");
    return { session, stateSaved: command.saveState };
  }
}

export class ResumeCampaignSession
  extends SessionCommandBase
  implements CommandHandler<ResumeCampaignSessionCommand, CampaignSessionRecord>
{
  async execute(
    command: ResumeCampaignSessionCommand,
  ): Promise<CampaignSessionRecord> {
    const session = await this.repository.findLastSession(command.campaignId);
    if (!session)
      throw new SessionLifecycleError(
        404,
        "Not Found",
        "No previous session found",
      );
    if (!session.savedState)
      throw new SessionLifecycleError(
        400,
        "Bad Request",
        "No saved state available for the last session",
      );
    await this.state.restore(command.campaignId, session.savedState);
    await this.repository.reopenSession(session.id);
    await this.repository.updateCampaignStatus(
      command.campaignId,
      "ACTIVE",
      new Date(),
    );
    return session;
  }
}

export function isSessionLifecycleError(
  error: unknown,
): error is SessionLifecycleError {
  return error instanceof SessionLifecycleError;
}
