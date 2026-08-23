import {
  CampaignActivityError,
  PublishCampaignActivity,
  type PublishCampaignActivityCommand,
} from "./CampaignActivityCommands";

describe("PublishCampaignActivity", () => {
  const messages = {
    createSystemMessage: jest.fn().mockResolvedValue({
      id: "activity-1",
      createdAt: new Date("2026-08-23T09:00:00.000Z"),
    }),
  };
  const realtime = { publish: jest.fn().mockResolvedValue(undefined) };
  const handler = new PublishCampaignActivity(messages, realtime);
  const command: PublishCampaignActivityCommand = {
    type: "campaign.activity.publish",
    campaignId: "campaign-1",
    actorId: "dm-1",
    sourceExtensionId: "weather.plugin",
    eventType: "weather.plugin.storm_started",
    kind: "scene",
    importance: "consequential",
    summary: "A thunderstorm begins.",
    payload: { intensity: 0.8 },
  };

  beforeEach(() => jest.clearAllMocks());

  it("persists and publishes a host-shaped extension activity event", async () => {
    await expect(handler.execute(command)).resolves.toEqual({
      id: "activity-1",
      createdAt: "2026-08-23T09:00:00.000Z",
    });
    expect(messages.createSystemMessage).toHaveBeenCalledWith(
      "campaign-1",
      "A thunderstorm begins.",
      expect.objectContaining({
        action: "weather.plugin.storm_started",
        activity: expect.objectContaining({
          kind: "scene",
          source: "extension",
          extensionId: "weather.plugin",
        }),
      }),
    );
    expect(realtime.publish).toHaveBeenCalledTimes(1);
  });

  it("requires event types to be namespaced to the authenticated extension", async () => {
    await expect(
      handler.execute({ ...command, eventType: "other.plugin.storm" }),
    ).rejects.toThrow(CampaignActivityError);
    expect(messages.createSystemMessage).not.toHaveBeenCalled();
  });

  it("bounds structured payloads", async () => {
    await expect(
      handler.execute({ ...command, payload: { value: "x".repeat(9_000) } }),
    ).rejects.toThrow("Activity payload exceeds 8 KiB");
  });
});
