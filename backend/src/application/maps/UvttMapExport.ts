import type {
  UvttExportRenderer,
  UvttMapExportRepository,
} from "../../ports/UvttMapExport";

export class UvttMapExportError extends Error {
  constructor(
    readonly status: 404 | 422,
    readonly error: "Not Found" | "Unprocessable Entity",
    message: string,
  ) {
    super(message);
    this.name = "UvttMapExportError";
  }
}

export class UvttMapExport {
  constructor(
    private readonly maps: UvttMapExportRepository,
    private readonly renderer: UvttExportRenderer,
  ) {}

  async execute(campaignId: string, mapId: string) {
    const lookup = await this.maps.source(campaignId, mapId);
    if (lookup.kind === "missing-map")
      throw new UvttMapExportError(404, "Not Found", "Map not found");
    if (lookup.kind === "missing-image")
      throw new UvttMapExportError(
        422,
        "Unprocessable Entity",
        "Map has no image",
      );
    if (lookup.kind === "missing-asset")
      throw new UvttMapExportError(
        422,
        "Unprocessable Entity",
        "Map image asset not found",
      );
    const source = lookup.source;
    let contents: Buffer;
    try {
      contents = await this.renderer.render(source);
    } catch {
      throw new UvttMapExportError(
        422,
        "Unprocessable Entity",
        "Map image file not found on disk",
      );
    }
    return {
      filename:
        source.name.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "map",
      contents,
    };
  }
}
