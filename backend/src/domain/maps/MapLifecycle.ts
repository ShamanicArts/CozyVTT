/** Transport- and ORM-neutral data for core map lifecycle commands. */

export type DiagonalRule = 'flat' | 'alternating';

export interface MapCoreRecord {
  id: string;
  revision: number;
  campaignId: string;
  name: string;
  imageUrl: string;
  width: number;
  height: number;
  gridSize: number;
  feetPerSquare: number;
  diagonalRule: string;
  baseLayerUrl: string;
  spiritLayerUrl: string | null;
  tokens: unknown;
  annotations: unknown;
  wallSegments: unknown;
  fogData: unknown;
  lightingEnabled: boolean;
  lights: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface MapCoreCreateData {
  campaignId: string;
  name: string;
  imageUrl: string;
  baseLayerUrl: string;
  width: number;
  height: number;
  gridSize: number;
  feetPerSquare: number;
  diagonalRule: DiagonalRule;
  spiritLayerUrl: string | null;
  tokens: [];
  annotations: [];
}

export interface MapCoreUpdateData {
  name?: string;
  width?: number;
  height?: number;
  gridSize?: number;
  feetPerSquare?: number;
  diagonalRule?: DiagonalRule;
  imageUrl?: string;
  baseLayerUrl?: string;
  spiritLayerUrl?: string | null;
}

export interface CurrentMapSummary {
  id: string;
  name: string;
  imageUrl: string;
}

/** Kept broad because the established set-current response returns the whole campaign record. */
export type CurrentMapCampaign = Record<string, unknown> & {
  currentMap: CurrentMapSummary | null;
};

export class MapLifecycleError extends Error {
  constructor(
    public readonly code: 'VALIDATION' | 'MAP_NOT_FOUND' | 'MAP_NOT_IN_CAMPAIGN' | 'CURRENT_MAP_CANNOT_DELETE',
    public readonly status: 400 | 404,
    public readonly error: 'Validation Error' | 'Not Found',
    message: string
  ) {
    super(message);
    this.name = 'MapLifecycleError';
  }
}

export function mapNotFound(): MapLifecycleError {
  return new MapLifecycleError('MAP_NOT_FOUND', 404, 'Not Found', 'Map not found');
}

export function mapNotInCampaign(): MapLifecycleError {
  return new MapLifecycleError('MAP_NOT_IN_CAMPAIGN', 404, 'Not Found', 'Map not found in this campaign');
}

export function validationError(message: string): MapLifecycleError {
  return new MapLifecycleError('VALIDATION', 400, 'Validation Error', message);
}
