export type RealtimeRole = "DM" | "PLAYER" | "SPECTATOR";

export interface RealtimeUserView {
  id: string;
  displayName: string;
  mustChangePassword: boolean;
}

export interface RealtimeCampaignView {
  id: string;
  ownerId: string;
  status: string;
  spiritLayerEnabled: boolean;
  currentMapId: string | null;
}

export interface RealtimeMembershipView {
  userId: string;
  role: RealtimeRole;
}

export interface RealtimeMapView {
  id: string;
  campaignId: string;
  width: number;
  height: number;
  gridSize: number;
  tokens: unknown;
  wallSegments: unknown;
  lights: unknown;
  fogData: unknown;
  [key: string]: unknown;
}

export interface RealtimeReadRepository {
  user(userId: string): Promise<RealtimeUserView | null>;
  campaign(campaignId: string): Promise<RealtimeCampaignView | null>;
  membership(
    userId: string,
    campaignId: string,
  ): Promise<RealtimeMembershipView | null>;
  memberships(
    campaignId: string,
    userIds: readonly string[],
  ): Promise<RealtimeMembershipView[]>;
  map(mapId: string): Promise<RealtimeMapView | null>;
  mapSummaries(campaignId: string): Promise<Record<string, unknown>[]>;
  initiative(campaignId: string): Promise<Record<string, unknown> | null>;
}
