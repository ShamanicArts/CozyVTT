import {
  END_CAMPAIGN_SESSION,
  PAUSE_CAMPAIGN_SESSION,
  RESUME_CAMPAIGN_SESSION,
  START_CAMPAIGN_SESSION,
  EndCampaignSession,
  PauseCampaignSession,
  ResumeCampaignSession,
  StartCampaignSession,
} from "./SessionLifecycleCommands";
import { SessionLifecycleError } from "../../domain/campaigns/SessionLifecycle";
import { CampaignSessionRepository } from "../../ports/CampaignSessionRepository";
import { CampaignSessionState } from "../../ports/CampaignSessionState";

const session = (overrides: Record<string, unknown> = {}) => ({
  id: "session-1",
  campaignId: "campaign-1",
  sessionNumber: 3,
  startedAt: new Date("2025-01-01"),
  endedAt: null,
  savedState: null,
  ...overrides,
});

function repository(): jest.Mocked<CampaignSessionRepository> {
  return {
    findCampaignStatus: jest.fn(),
    nextSessionNumber: jest.fn(),
    createSession: jest.fn(),
    findSession: jest.fn(),
    findLastSession: jest.fn(),
    saveSessionState: jest.fn(),
    endSession: jest.fn(),
    reopenSession: jest.fn(),
    updateCampaignStatus: jest.fn(),
  };
}

function state(): jest.Mocked<CampaignSessionState> {
  return { capture: jest.fn(), restore: jest.fn() };
}

describe("campaign session lifecycle commands", () => {
  it("starts only an existing inactive campaign, then creates before marking it active", async () => {
    const store = repository();
    const snapshots = state();
    store.findCampaignStatus.mockResolvedValue({ status: "PREPARATION" });
    store.nextSessionNumber.mockResolvedValue(3);
    store.createSession.mockResolvedValue(session());
    await new StartCampaignSession(store, snapshots).execute({
      type: START_CAMPAIGN_SESSION,
      campaignId: "campaign-1",
    });
    expect(store.createSession).toHaveBeenCalledWith("campaign-1", 3);
    expect(store.createSession.mock.invocationCallOrder[0]).toBeLessThan(
      store.updateCampaignStatus.mock.invocationCallOrder[0],
    );
  });

  it("keeps active-session rejection before creating another session", async () => {
    const store = repository();
    const snapshots = state();
    store.findCampaignStatus.mockResolvedValue({ status: "ACTIVE" });
    await expect(
      new StartCampaignSession(store, snapshots).execute({
        type: START_CAMPAIGN_SESSION,
        campaignId: "campaign-1",
      }),
    ).rejects.toEqual(
      new SessionLifecycleError(
        400,
        "Bad Request",
        "A session is already active. Please end or pause the current session first.",
      ),
    );
    expect(store.createSession).not.toHaveBeenCalled();
  });

  it("captures and persists a pause snapshot before marking the campaign paused", async () => {
    const store = repository();
    const snapshots = state();
    const saved = { mapId: "map-1" };
    store.findSession.mockResolvedValue(session());
    snapshots.capture.mockResolvedValue(saved);
    await new PauseCampaignSession(store, snapshots).execute({
      type: PAUSE_CAMPAIGN_SESSION,
      campaignId: "campaign-1",
      sessionId: "session-1",
    });
    expect(store.saveSessionState).toHaveBeenCalledWith("session-1", saved);
    expect(store.saveSessionState.mock.invocationCallOrder[0]).toBeLessThan(
      store.updateCampaignStatus.mock.invocationCallOrder[0],
    );
  });

  it("ends with the optional snapshot and notes normalization before marking inactive", async () => {
    const store = repository();
    const snapshots = state();
    store.findSession.mockResolvedValue(session());
    snapshots.capture.mockResolvedValue({ mapId: "map-1" });
    const result = await new EndCampaignSession(store, snapshots).execute({
      type: END_CAMPAIGN_SESSION,
      campaignId: "campaign-1",
      sessionId: "session-1",
      saveState: true,
      notes: 42,
    });
    expect(result.stateSaved).toBe(true);
    expect(store.endSession).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ savedState: { mapId: "map-1" }, notes: "42" }),
    );
    expect(store.endSession.mock.invocationCallOrder[0]).toBeLessThan(
      store.updateCampaignStatus.mock.invocationCallOrder[0],
    );
  });

  it("restores the latest saved session before reopening it and making the campaign active", async () => {
    const store = repository();
    const snapshots = state();
    const saved = { mapId: "map-1" };
    store.findLastSession.mockResolvedValue(
      session({ endedAt: new Date(), savedState: saved }),
    );
    await new ResumeCampaignSession(store, snapshots).execute({
      type: RESUME_CAMPAIGN_SESSION,
      campaignId: "campaign-1",
    });
    expect(snapshots.restore).toHaveBeenCalledWith("campaign-1", saved);
    expect(snapshots.restore.mock.invocationCallOrder[0]).toBeLessThan(
      store.reopenSession.mock.invocationCallOrder[0],
    );
  });
});
