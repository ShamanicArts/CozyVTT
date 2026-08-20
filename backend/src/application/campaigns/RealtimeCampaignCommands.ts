import {
  findVibePeriod,
  normalizeVibeSettings,
  VibePeriod,
} from "../../utils/vibe-presets";
import { CampaignRealtimeRepository } from "../../ports/CampaignRealtimeRepository";
import { CampaignRealtimeEventPublisher } from "../../ports/CampaignRealtimeEventPublisher";
import { Command, CommandHandler } from "../commands/CommandBus";

export const SET_ATMOSPHERE_EFFECT = "campaign.atmosphere.effect.set" as const;
export const SET_ATMOSPHERE_AUDIO = "campaign.atmosphere.audio.set" as const;
export const SET_CAMPAIGN_VIBE = "campaign.vibe.set" as const;

export class RealtimeCampaignError extends Error {
  constructor(public readonly message: string) {
    super(message);
    this.name = "RealtimeCampaignError";
  }
}
export interface SetAtmosphereEffectCommand extends Command<string | null> {
  readonly type: typeof SET_ATMOSPHERE_EFFECT;
  readonly campaignId: string;
  readonly effect: unknown;
  /** The human or delegated identity shown to campaign clients. */
  readonly actorId?: string;
}
export interface SetAtmosphereAudioCommand extends Command<{
  assetId: string | null;
  audioUrl: string | null;
  volume: number;
  loop: boolean;
}> {
  readonly type: typeof SET_ATMOSPHERE_AUDIO;
  readonly campaignId: string;
  readonly assetId: unknown;
  readonly volume: unknown;
  readonly loop: unknown;
  /** The human or delegated identity shown to campaign clients. */
  readonly actorId?: string;
}
export interface SetCampaignVibeCommand extends Command<VibePeriod> {
  readonly type: typeof SET_CAMPAIGN_VIBE;
  readonly campaignId: string;
  readonly period: unknown;
  /** The human or delegated identity shown to campaign clients. */
  readonly actorId?: string;
}

export class SetAtmosphereEffect implements CommandHandler<
  SetAtmosphereEffectCommand,
  string | null
> {
  constructor(
    private readonly repository: CampaignRealtimeRepository,
    private readonly events: CampaignRealtimeEventPublisher,
  ) {}
  async execute(command: SetAtmosphereEffectCommand): Promise<string | null> {
    const valid = ["rain", "mist", "leaves", "sparkles", "snow", "wind"];
    const effect =
      command.effect === null ||
      (typeof command.effect === "string" && valid.includes(command.effect))
        ? command.effect
        : null;
    const campaign = await this.repository.findVibe(command.campaignId);
    const existing = (campaign?.vibeSettings as Record<string, unknown>) ?? {};
    await this.repository.updateVibeSettings(command.campaignId, {
      ...existing,
      atmosphereEffect: effect,
    });
    this.events.atmosphereEffectUpdated(command.campaignId, {
      effect,
      setBy: command.actorId ?? null,
      timestamp: new Date().toISOString(),
    });
    return effect;
  }
}

export class SetAtmosphereAudio implements CommandHandler<
  SetAtmosphereAudioCommand,
  {
    assetId: string | null;
    audioUrl: string | null;
    volume: number;
    loop: boolean;
  }
> {
  constructor(
    private readonly repository: CampaignRealtimeRepository,
    private readonly events: CampaignRealtimeEventPublisher,
  ) {}
  async execute(command: SetAtmosphereAudioCommand): Promise<{
    assetId: string | null;
    audioUrl: string | null;
    volume: number;
    loop: boolean;
  }> {
    const assetId =
      typeof command.assetId === "string" && command.assetId
        ? command.assetId
        : null;
    if (assetId) {
      const asset = await this.repository.findAudioAsset(assetId);
      if (!asset || asset.type !== "AUDIO")
        throw new RealtimeCampaignError("Audio asset not found");
      if (asset.scope === "CAMPAIGN" && asset.campaignId !== command.campaignId)
        throw new RealtimeCampaignError(
          "Asset does not belong to this campaign",
        );
    }
    const volume =
      typeof command.volume === "number"
        ? Math.min(1, Math.max(0, command.volume))
        : 0.5;
    const loop = command.loop !== false;
    const campaign = await this.repository.findVibe(command.campaignId);
    const existing = (campaign?.vibeSettings as Record<string, unknown>) ?? {};
    await this.repository.updateVibeSettings(command.campaignId, {
      ...existing,
      atmosphereAudio: assetId ? { assetId, volume, loop } : null,
    });
    const result = {
      assetId,
      audioUrl: assetId ? `/api/assets/audio/${assetId}` : null,
      volume,
      loop,
    };
    this.events.atmosphereAudioUpdated(command.campaignId, {
      ...result,
      setBy: command.actorId ?? null,
      timestamp: new Date().toISOString(),
    });
    return result;
  }
}

export class SetCampaignVibe implements CommandHandler<
  SetCampaignVibeCommand,
  VibePeriod
> {
  constructor(
    private readonly repository: CampaignRealtimeRepository,
    private readonly events: CampaignRealtimeEventPublisher,
  ) {}
  async execute(command: SetCampaignVibeCommand): Promise<VibePeriod> {
    if (!command.period || typeof command.period !== "string")
      throw new RealtimeCampaignError("period (string) is required");
    const campaign = await this.repository.findVibe(command.campaignId);
    if (!campaign) throw new RealtimeCampaignError("Campaign not found");
    const settings = normalizeVibeSettings(campaign.vibeSettings);
    if (!settings.enabled)
      throw new RealtimeCampaignError(
        "Vibe tracker is not enabled for this campaign",
      );
    const period = findVibePeriod(settings, command.period);
    if (!period)
      throw new RealtimeCampaignError(
        `Unknown vibe period '${command.period}'. Available: ${settings.periods.map((item) => item.name).join(", ")}`,
      );
    await this.repository.updateCurrentVibe(command.campaignId, period.name);
    this.events.vibeUpdated(command.campaignId, {
      period: period.name,
      hue: period.hue,
      filter: period.filter,
      audio: period.audio,
      updatedBy: command.actorId ?? null,
      timestamp: new Date().toISOString(),
    });
    return period;
  }
}
