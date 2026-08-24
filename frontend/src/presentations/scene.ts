import type { Campaign, CampaignRole, Map, Token } from "@/types";
import type { FogState, LightSource, WallSegment } from "@/types/walls";
import { useGameStore } from "@/stores/gameStore";
import type socketClient from "@/services/socket";
import { playerColor } from "@/utils/playerColor";

export type CampaignPresentationInteractionMode =
  | "none"
  | "ruler"
  | "aoe"
  | "ping";

export interface CampaignPresentationInteractionPoint {
  readonly x: number;
  readonly y: number;
}

export interface CampaignPresentationPing {
  readonly id: string;
  readonly position: CampaignPresentationInteractionPoint;
  readonly name: string;
  readonly color: string;
  readonly startedAt: number;
}

export interface CampaignPresentationInteractionState {
  readonly mode: CampaignPresentationInteractionMode;
  readonly ruler: {
    readonly origin: CampaignPresentationInteractionPoint | null;
    readonly color: "amber" | "purple" | "black";
  };
  readonly aoe: {
    readonly origin: CampaignPresentationInteractionPoint | null;
    readonly shape: "sphere" | "cylinder" | "cone" | "line" | "cube";
    readonly sizeFt: number;
    readonly widthFt?: number;
  };
  readonly pings: readonly CampaignPresentationPing[];
}

export interface CampaignPresentationSceneToken {
  readonly id: string;
  readonly name: string;
  readonly imageUrl: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly rotation: number;
  readonly disposition: Token["disposition"];
  readonly canMove: boolean;
}

export interface CampaignPresentationSceneMap {
  readonly id: string;
  readonly revision: number;
  readonly name: string;
  readonly imageUrl: string;
  readonly width: number;
  readonly height: number;
  readonly gridSize: number;
  readonly feetPerSquare: number;
  readonly diagonalRule: "flat" | "alternating";
  readonly lightingEnabled: boolean;
  readonly tokens: readonly CampaignPresentationSceneToken[];
  readonly walls: readonly WallSegment[];
  readonly lights: readonly LightSource[];
  readonly fog:
    | { readonly kind: "full"; readonly state: FogState }
    | {
        readonly kind: "revealed";
        readonly cells: readonly number[];
        readonly fogCols: number;
        readonly fogRows: number;
        readonly cellPx: number;
      }
    | { readonly kind: "none" };
}

export interface CampaignPresentationSceneSnapshot {
  readonly version: "1";
  readonly campaignId: string;
  readonly role: CampaignRole;
  readonly selectedTokenId: string | null;
  readonly interaction: CampaignPresentationInteractionState;
  readonly map: CampaignPresentationSceneMap | null;
}

export interface CampaignPresentationSceneAccess {
  getSnapshot(): CampaignPresentationSceneSnapshot;
  subscribe(listener: () => void): () => void;
  selectToken(tokenId: string | null): void;
  setInteractionMode(mode: CampaignPresentationInteractionMode): void;
  setRulerOrigin(origin: CampaignPresentationInteractionPoint | null): void;
  setRulerColor(color: "amber" | "purple" | "black"): void;
  setAoE(input: {
    readonly origin?: CampaignPresentationInteractionPoint | null;
    readonly shape?: CampaignPresentationInteractionState["aoe"]["shape"];
    readonly sizeFt?: number;
    readonly widthFt?: number;
  }): void;
  ping(position: CampaignPresentationInteractionPoint): void;
  moveToken(input: {
    readonly tokenId: string;
    readonly x: number;
    readonly y: number;
  }): Promise<void>;
}

interface SceneHostState {
  readonly campaign: Campaign;
  readonly map: Map | null;
  readonly role: CampaignRole;
  readonly userId: string;
}

/** Host-owned adapter that keeps trusted presentation modules away from raw app state. */
export class CampaignSceneAccess implements CampaignPresentationSceneAccess {
  private readonly listeners = new Set<() => void>();
  private state: SceneHostState;
  private socket: typeof socketClient | null = null;
  private disconnectSocket: (() => void) | null = null;
  private revealedCells: readonly number[] | null = null;
  private unsubscribeTokens: (() => void) | null = null;
  private selectedTokenId: string | null = null;
  private interaction: CampaignPresentationInteractionState = {
    mode: "none",
    ruler: { origin: null, color: "amber" },
    aoe: { origin: null, shape: "sphere", sizeFt: 20 },
    pings: [],
  };
  private readonly pingTimers = new Set<ReturnType<typeof setTimeout>>();
  private onMapChanged: (map: Map, spiritVisible?: boolean) => void;

  constructor(
    state: SceneHostState,
    onMapChanged: (map: Map, spiritVisible?: boolean) => void,
  ) {
    this.state = state;
    this.onMapChanged = onMapChanged;
  }

  update(
    state: SceneHostState,
    onMapChanged: (map: Map, spiritVisible?: boolean) => void,
  ): void {
    const changed =
      state.campaign !== this.state.campaign ||
      state.map !== this.state.map ||
      state.role !== this.state.role ||
      state.userId !== this.state.userId;
    const mapChanged = state.map?.id !== this.state.map?.id;
    this.state = state;
    this.onMapChanged = onMapChanged;
    if (mapChanged) {
      this.revealedCells = null;
      this.selectedTokenId = null;
      this.interaction = {
        ...this.interaction,
        mode: "none",
        ruler: { ...this.interaction.ruler, origin: null },
        aoe: { ...this.interaction.aoe, origin: null },
        pings: [],
      };
      this.requestMapState(state.map?.id);
    }
    if (changed) this.emit();
  }

  setSocket(socket: typeof socketClient | null): void {
    if (this.socket === socket) return;
    this.detachSocket();
    this.socket = socket;
    if (socket && this.listeners.size > 0) this.attachSocket(socket);
  }

  private attachSocket(socket: typeof socketClient): void {
    if (this.disconnectSocket) return;
    const raw = socket.getSocket();
    if (!raw) return;

    const forCurrentMap = (mapId: string) => this.state.map?.id === mapId;
    const patchMap = (patch: Partial<Map>) => {
      if (!this.state.map) return;
      const map = { ...this.state.map, ...patch };
      this.state = { ...this.state, map };
      this.onMapChanged(map);
      this.emit();
    };
    const tokenMoved = (event: { tokenId: string; x: number; y: number }) =>
      useGameStore
        .getState()
        .applyTokenMove(event.tokenId, { x: event.x, y: event.y });
    const tokenAppeared = (event: { token: Token; mapId: string }) => {
      if (forCurrentMap(event.mapId)) useGameStore.getState().revealToken(event.token);
    };
    const tokenDisappeared = (event: { tokenId: string; mapId: string }) => {
      if (forCurrentMap(event.mapId)) useGameStore.getState().removeToken(event.tokenId);
    };
    const mapChanged = (event: {
      mapData: Map;
      spiritVisible?: boolean;
    }) => {
      this.state = { ...this.state, map: event.mapData };
      this.revealedCells = null;
      useGameStore.getState().setTokens(event.mapData.tokens ?? []);
      this.onMapChanged(event.mapData, event.spiritVisible);
      this.requestMapState(event.mapData.id);
      this.emit();
    };
    const wallAdded = (event: { mapId: string; segment: WallSegment }) => {
      if (!forCurrentMap(event.mapId)) return;
      patchMap({
        wallSegments: [...(this.state.map?.wallSegments ?? []), event.segment],
      });
    };
    const wallRemoved = (event: { mapId: string; segmentId: string }) => {
      if (!forCurrentMap(event.mapId)) return;
      patchMap({
        wallSegments: (this.state.map?.wallSegments ?? []).filter(
          (wall) => wall.id !== event.segmentId,
        ),
      });
    };
    const wallUpdated = (event: { mapId: string; segment: WallSegment }) => {
      if (!forCurrentMap(event.mapId)) return;
      patchMap({
        wallSegments: (this.state.map?.wallSegments ?? []).map((wall) =>
          wall.id === event.segment.id ? event.segment : wall,
        ),
      });
    };
    const wallsReplaced = (event: {
      mapId: string;
      segments: WallSegment[];
    }) => {
      if (forCurrentMap(event.mapId)) patchMap({ wallSegments: event.segments });
    };
    const lightAdded = (event: { mapId: string; light: LightSource }) => {
      if (!forCurrentMap(event.mapId)) return;
      patchMap({ lights: [...(this.state.map?.lights ?? []), event.light] });
    };
    const lightRemoved = (event: { mapId: string; lightId: string }) => {
      if (!forCurrentMap(event.mapId)) return;
      patchMap({
        lights: (this.state.map?.lights ?? []).filter(
          (light) => light.id !== event.lightId,
        ),
      });
    };
    const lightUpdated = (event: { mapId: string; light: LightSource }) => {
      if (!forCurrentMap(event.mapId)) return;
      patchMap({
        lights: (this.state.map?.lights ?? []).map((light) =>
          light.id === event.light.id ? event.light : light,
        ),
      });
    };
    const lightsReplaced = (event: {
      mapId: string;
      lights: LightSource[];
    }) => {
      if (forCurrentMap(event.mapId)) patchMap({ lights: event.lights });
    };
    const lightingUpdated = (event: {
      mapId: string;
      lightingEnabled: boolean;
    }) => {
      if (forCurrentMap(event.mapId))
        patchMap({ lightingEnabled: event.lightingEnabled });
    };
    const fogUpdated = (event: { mapId: string; fogState: FogState }) => {
      if (forCurrentMap(event.mapId)) patchMap({ fogData: event.fogState });
    };
    const fogCells = (event: { mapId: string; revealedCells: number[] }) => {
      if (!forCurrentMap(event.mapId)) return;
      this.revealedCells = event.revealedCells;
      this.emit();
    };
    const mapPinged = (event: {
      mapId: string;
      x: number;
      y: number;
      userId: string;
    }) => {
      const map = this.state.map;
      if (!map || event.mapId !== map.id) return;
      const id = `${event.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const ping: CampaignPresentationPing = {
        id,
        position: { x: event.x / map.gridSize, y: event.y / map.gridSize },
        name: this.resolveMemberName(event.userId),
        color: playerColor(event.userId),
        startedAt: Date.now(),
      };
      this.interaction = {
        ...this.interaction,
        pings: [...this.interaction.pings.slice(-19), ping],
      };
      this.emit();
      const timer = setTimeout(() => {
        this.pingTimers.delete(timer);
        this.interaction = {
          ...this.interaction,
          pings: this.interaction.pings.filter(({ id: pingId }) => pingId !== id),
        };
        this.emit();
      }, 1_600);
      this.pingTimers.add(timer);
    };

    raw.on("token.moved", tokenMoved);
    raw.on("token:appeared", tokenAppeared);
    raw.on("token:disappeared", tokenDisappeared);
    raw.on("map.changed", mapChanged);
    raw.on("wall:added", wallAdded);
    raw.on("wall:removed", wallRemoved);
    raw.on("wall:updated", wallUpdated);
    raw.on("walls:replaced", wallsReplaced);
    raw.on("light:added", lightAdded);
    raw.on("light:removed", lightRemoved);
    raw.on("light:updated", lightUpdated);
    raw.on("lights:replaced", lightsReplaced);
    raw.on("map:lighting:updated", lightingUpdated);
    raw.on("fog:updated", fogUpdated);
    raw.on("fog:cells", fogCells);
    raw.on("map.pinged", mapPinged);

    this.requestMapState(this.state.map?.id);

    this.disconnectSocket = () => {
      raw.off("token.moved", tokenMoved);
      raw.off("token:appeared", tokenAppeared);
      raw.off("token:disappeared", tokenDisappeared);
      raw.off("map.changed", mapChanged);
      raw.off("wall:added", wallAdded);
      raw.off("wall:removed", wallRemoved);
      raw.off("wall:updated", wallUpdated);
      raw.off("walls:replaced", wallsReplaced);
      raw.off("light:added", lightAdded);
      raw.off("light:removed", lightRemoved);
      raw.off("light:updated", lightUpdated);
      raw.off("lights:replaced", lightsReplaced);
      raw.off("map:lighting:updated", lightingUpdated);
      raw.off("fog:updated", fogUpdated);
      raw.off("fog:cells", fogCells);
      raw.off("map.pinged", mapPinged);
    };
  }

  private detachSocket(): void {
    this.disconnectSocket?.();
    this.disconnectSocket = null;
  }

  private requestMapState(mapId: string | undefined): void {
    const raw = this.socket?.getSocket();
    if (!raw || !mapId || this.listeners.size === 0) return;
    raw.emit("walls:request", { mapId });
    raw.emit("lights:request", { mapId });
    raw.emit("fog:request_state", { mapId });
  }

  dispose(): void {
    this.detachSocket();
    this.socket = null;
    this.unsubscribeTokens?.();
    this.unsubscribeTokens = null;
    for (const timer of this.pingTimers) clearTimeout(timer);
    this.pingTimers.clear();
    this.listeners.clear();
  }

  getSnapshot(): CampaignPresentationSceneSnapshot {
    const { campaign, map, role, userId } = this.state;
    if (!map) {
      return {
        version: "1",
        campaignId: campaign.id,
        role,
        selectedTokenId: null,
        interaction: this.interaction,
        map: null,
      };
    }
    const store = useGameStore.getState();
    const tokens = store.tokenOrder
      .map((id) => store.tokens[id])
      .filter((token): token is Token => Boolean(token))
      .map((token) => ({
        id: token.id,
        name: token.name,
        imageUrl: token.imageUrl,
        position: { ...token.position },
        size: { ...token.size },
        rotation: token.rotation,
        disposition: token.disposition,
        canMove: this.canMoveToken(token, campaign, role, userId),
      }));
    const fog =
      role === "DM" && map.fogData
        ? ({ kind: "full", state: map.fogData } as const)
        : this.revealedCells
          ? ({
              kind: "revealed",
              cells: this.revealedCells,
              fogCols: map.width,
              fogRows: map.height,
              cellPx: map.gridSize,
            } as const)
          : ({ kind: "none" } as const);
    return {
      version: "1",
      campaignId: campaign.id,
      role,
      selectedTokenId: tokens.some(({ id }) => id === this.selectedTokenId)
        ? this.selectedTokenId
        : null,
      interaction: this.interaction,
      map: {
        id: map.id,
        revision: map.revision,
        name: map.name,
        imageUrl: map.imageUrl,
        width: map.width,
        height: map.height,
        gridSize: map.gridSize,
        feetPerSquare: map.feetPerSquare ?? 5,
        diagonalRule: map.diagonalRule ?? "flat",
        lightingEnabled: map.lightingEnabled ?? false,
        tokens,
        walls: map.wallSegments ?? [],
        lights: map.lights ?? [],
        fog,
      },
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.unsubscribeTokens = useGameStore.subscribe(() => this.emit());
      if (this.socket) this.attachSocket(this.socket);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size > 0) return;
      this.unsubscribeTokens?.();
      this.unsubscribeTokens = null;
      this.detachSocket();
    };
  }

  selectToken(tokenId: string | null): void {
    if (tokenId !== null) {
      const tokenExists = this.getSnapshot().map?.tokens.some(
        (token) => token.id === tokenId,
      );
      if (!tokenExists) throw new Error("Token selection is not permitted.");
    }
    if (this.selectedTokenId === tokenId) return;
    this.selectedTokenId = tokenId;
    this.emit();
  }

  setInteractionMode(mode: CampaignPresentationInteractionMode): void {
    if (this.interaction.mode === mode) return;
    this.interaction = { ...this.interaction, mode };
    this.emit();
  }

  setRulerOrigin(origin: CampaignPresentationInteractionPoint | null): void {
    const nextOrigin =
      this.state.role === "DM" ? origin : this.controlledTokenOrigin();
    this.interaction = {
      ...this.interaction,
      ruler: { ...this.interaction.ruler, origin: nextOrigin },
    };
    this.emit();
  }

  setRulerColor(color: "amber" | "purple" | "black"): void {
    if (this.interaction.ruler.color === color) return;
    this.interaction = {
      ...this.interaction,
      ruler: { ...this.interaction.ruler, color },
    };
    this.emit();
  }

  setAoE(input: {
    readonly origin?: CampaignPresentationInteractionPoint | null;
    readonly shape?: CampaignPresentationInteractionState["aoe"]["shape"];
    readonly sizeFt?: number;
    readonly widthFt?: number;
  }): void {
    const sizeFt = input.sizeFt ?? this.interaction.aoe.sizeFt;
    const widthFt = input.widthFt ?? this.interaction.aoe.widthFt;
    if (!Number.isFinite(sizeFt) || sizeFt <= 0) return;
    if (widthFt !== undefined && (!Number.isFinite(widthFt) || widthFt <= 0)) return;
    this.interaction = {
      ...this.interaction,
      aoe: {
        ...this.interaction.aoe,
        ...input,
        sizeFt,
        ...(widthFt === undefined ? {} : { widthFt }),
      },
    };
    this.emit();
  }

  ping(position: CampaignPresentationInteractionPoint): void {
    const map = this.state.map;
    if (!map || !this.socket?.isConnected()) return;
    const x = Math.max(0, Math.min(position.x, map.width)) * map.gridSize;
    const y = Math.max(0, Math.min(position.y, map.height)) * map.gridSize;
    this.socket.emitMapPing({ mapId: map.id, x, y });
  }

  async moveToken(input: {
    readonly tokenId: string;
    readonly x: number;
    readonly y: number;
  }): Promise<void> {
    const map = this.state.map;
    const token = useGameStore.getState().tokens[input.tokenId];
    if (!map || !token || !this.canMoveToken(token, this.state.campaign, this.state.role, this.state.userId)) {
      throw new Error("Token movement is not permitted.");
    }
    const x = Math.max(0, Math.min(Math.floor(input.x), map.width - token.size.width));
    const y = Math.max(0, Math.min(Math.floor(input.y), map.height - token.size.height));
    if (!this.socket?.isConnected()) throw new Error("Campaign connection is unavailable.");
    this.socket.emitTokenMoveStart({ tokenId: token.id, mapId: map.id });
    this.socket.emitTokenMoveEnd({ tokenId: token.id, mapId: map.id, x, y });
    useGameStore.getState().applyTokenMove(token.id, { x, y });
  }

  private canMoveToken(
    token: Token,
    campaign: Campaign,
    role: CampaignRole,
    userId: string,
  ): boolean {
    if (role === "DM") return true;
    if (role !== "PLAYER" || campaign.status === "PAUSED" || campaign.status === "INACTIVE") return false;
    if (token.controlledBy === userId) return true;
    if (!token.characterId) return false;
    return campaign.characters?.some(
      (character) => character.id === token.characterId && character.userId === userId,
    ) ?? false;
  }

  private controlledTokenOrigin(): CampaignPresentationInteractionPoint | null {
    const { campaign, role, userId } = this.state;
    const store = useGameStore.getState();
    const token = store.tokenOrder
      .map((id) => store.tokens[id])
      .find(
        (candidate): candidate is Token =>
          Boolean(candidate) &&
          this.canMoveToken(candidate, campaign, role, userId),
      );
    return token ? { ...token.position } : null;
  }

  private resolveMemberName(userId: string): string {
    if (userId === this.state.userId) return "You";
    return (
      this.state.campaign.memberships?.find(
        (membership) => membership.userId === userId,
      )?.user?.displayName ?? ""
    );
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
