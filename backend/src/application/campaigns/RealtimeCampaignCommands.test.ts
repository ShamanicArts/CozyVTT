import {
  SET_ATMOSPHERE_AUDIO,
  SET_ATMOSPHERE_EFFECT,
  SET_CAMPAIGN_VIBE,
  SetAtmosphereAudio,
  SetAtmosphereEffect,
  SetCampaignVibe,
} from "./RealtimeCampaignCommands";
import { CampaignRealtimeEventPublisher } from "../../ports/CampaignRealtimeEventPublisher";
import { CampaignRealtimeRepository } from "../../ports/CampaignRealtimeRepository";

function repository(): jest.Mocked<CampaignRealtimeRepository> {
  return {
    findVibe: jest.fn(),
    updateVibeSettings: jest.fn(),
    updateCurrentVibe: jest.fn(),
    findAudioAsset: jest.fn(),
  };
}

function events(): jest.Mocked<CampaignRealtimeEventPublisher> {
  return {
    atmosphereEffectUpdated: jest.fn(),
    atmosphereAudioUpdated: jest.fn(),
    vibeUpdated: jest.fn(),
  };
}

describe("campaign realtime commands", () => {
  it("persists and then fans out an atmosphere effect exactly once", async () => {
    const store = repository();
    const published = events();
    store.findVibe.mockResolvedValue({ vibeSettings: {}, currentVibe: null });

    const result = await new SetAtmosphereEffect(store, published).execute({
      type: SET_ATMOSPHERE_EFFECT,
      campaignId: "campaign-1",
      effect: "rain",
      actorId: "user-1",
    });

    expect(result).toBe("rain");
    expect(store.updateVibeSettings).toHaveBeenCalledWith("campaign-1", {
      atmosphereEffect: "rain",
    });
    expect(published.atmosphereEffectUpdated).toHaveBeenCalledTimes(1);
    expect(published.atmosphereEffectUpdated).toHaveBeenCalledWith(
      "campaign-1",
      expect.objectContaining({ effect: "rain", setBy: "user-1" }),
    );
    expect(store.updateVibeSettings.mock.invocationCallOrder[0]).toBeLessThan(
      published.atmosphereEffectUpdated.mock.invocationCallOrder[0],
    );
  });

  it("preserves the atmosphere audio wire payload through the application port", async () => {
    const store = repository();
    const published = events();
    store.findVibe.mockResolvedValue({ vibeSettings: {}, currentVibe: null });
    store.findAudioAsset.mockResolvedValue({
      id: "asset-1",
      type: "AUDIO",
      scope: "CAMPAIGN",
      campaignId: "campaign-1",
    });

    await new SetAtmosphereAudio(store, published).execute({
      type: SET_ATMOSPHERE_AUDIO,
      campaignId: "campaign-1",
      assetId: "asset-1",
      volume: 0.75,
      loop: false,
      actorId: "user-1",
    });

    expect(published.atmosphereAudioUpdated).toHaveBeenCalledTimes(1);
    expect(published.atmosphereAudioUpdated).toHaveBeenCalledWith(
      "campaign-1",
      expect.objectContaining({
        assetId: "asset-1",
        audioUrl: "/api/assets/audio/asset-1",
        volume: 0.75,
        loop: false,
        setBy: "user-1",
      }),
    );
  });

  it("preserves the vibe event name payload through the application port", async () => {
    const store = repository();
    const published = events();
    store.findVibe.mockResolvedValue({
      currentVibe: null,
      vibeSettings: {
        enabled: true,
        periods: [
          {
            name: "dusk",
            hue: "#FF9966",
            filter: "brightness(0.85)",
            audio: "evening_breeze.mp3",
          },
        ],
      },
    });

    await new SetCampaignVibe(store, published).execute({
      type: SET_CAMPAIGN_VIBE,
      campaignId: "campaign-1",
      period: "dusk",
      actorId: "user-1",
    });

    expect(published.vibeUpdated).toHaveBeenCalledTimes(1);
    expect(published.vibeUpdated).toHaveBeenCalledWith(
      "campaign-1",
      expect.objectContaining({
        period: "dusk",
        hue: "#FF9966",
        filter: "brightness(0.85)",
        audio: "evening_breeze.mp3",
        updatedBy: "user-1",
      }),
    );
  });
});
