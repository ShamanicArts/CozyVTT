export interface UvttExportSource {
  name: string;
  width: number;
  height: number;
  gridSize: number;
  wallSegments: unknown;
  lights: unknown;
  imageFilePath: string;
}

export interface UvttMapExportRepository {
  source(
    campaignId: string,
    mapId: string,
  ): Promise<
    | { kind: "found"; source: UvttExportSource }
    | { kind: "missing-map" }
    | { kind: "missing-image" }
    | { kind: "missing-asset" }
  >;
}

export interface UvttExportRenderer {
  render(source: UvttExportSource): Promise<Buffer>;
}
