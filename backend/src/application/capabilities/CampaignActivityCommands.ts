import type {
  CampaignActivityImportance,
  CampaignActivityKind,
  CampaignActivityRealtimePublisher,
} from "../../ports/CampaignActivity";
import type { SystemMessageRepository } from "../../ports/SystemMessageRepository";
import type { Command, CommandHandler } from "../commands/CommandBus";

export const PUBLIC_PUBLISH_CAMPAIGN_ACTIVITY =
  "campaign.activity.publish" as const;

export interface PublishCampaignActivityCommand extends Command<{
  id: string;
  createdAt: string;
}> {
  readonly type: typeof PUBLIC_PUBLISH_CAMPAIGN_ACTIVITY;
  readonly campaignId: string;
  readonly actorId: string;
  readonly sourceExtensionId: string;
  readonly eventType: string;
  readonly kind: CampaignActivityKind;
  readonly importance?: CampaignActivityImportance;
  readonly summary: string;
  readonly payload?: Record<string, unknown>;
}

export class CampaignActivityError extends Error {}

export class PublishCampaignActivity implements CommandHandler<
  PublishCampaignActivityCommand,
  { id: string; createdAt: string }
> {
  constructor(
    private readonly messages: SystemMessageRepository,
    private readonly realtime: CampaignActivityRealtimePublisher,
  ) {}

  async execute(
    command: PublishCampaignActivityCommand,
  ): Promise<{ id: string; createdAt: string }> {
    const extensionId = command.sourceExtensionId?.trim();
    if (!extensionId) {
      throw new CampaignActivityError("Extension identity is required");
    }
    if (
      typeof command.eventType !== "string" ||
      !command.eventType.startsWith(`${extensionId}.`) ||
      !/^[a-z0-9][a-z0-9._-]{2,199}$/.test(command.eventType)
    ) {
      throw new CampaignActivityError(
        `Event type must be namespaced to ${extensionId}`,
      );
    }
    if (
      !["narrative", "mechanic", "scene", "session", "system"].includes(
        command.kind,
      )
    ) {
      throw new CampaignActivityError("Unsupported activity kind");
    }
    const summary = command.summary?.trim();
    if (!summary || summary.length > 500) {
      throw new CampaignActivityError(
        "Activity summary must contain between 1 and 500 characters",
      );
    }
    const importance = command.importance ?? "routine";
    if (!["routine", "consequential", "error"].includes(importance)) {
      throw new CampaignActivityError("Unsupported activity importance");
    }
    if (command.payload) {
      let serialized: string;
      try {
        serialized = JSON.stringify(command.payload);
      } catch {
        throw new CampaignActivityError("Activity payload must be JSON data");
      }
      if (Buffer.byteLength(serialized, "utf8") > 8_192) {
        throw new CampaignActivityError("Activity payload exceeds 8 KiB");
      }
    }

    const metadata: Record<string, unknown> = {
      action: command.eventType,
      activity: {
        version: 1,
        kind: command.kind,
        importance,
        source: "extension",
        extensionId,
        eventType: command.eventType,
        actorId: command.actorId,
      },
      ...(command.payload ? { payload: command.payload } : {}),
    };
    const message = await this.messages.createSystemMessage(
      command.campaignId,
      summary,
      metadata,
    );
    await this.realtime.publish({
      campaignId: command.campaignId,
      id: message.id,
      content: summary,
      metadata,
      createdAt: message.createdAt,
    });
    return { id: message.id, createdAt: message.createdAt.toISOString() };
  }
}
