/** Raised when a JSON-backed map changed after an application command read it. */
export class MapRevisionConflictError extends Error {
  public constructor(
    public readonly mapId: string,
    public readonly expectedRevision: number,
  ) {
    super("Map state changed before this operation could be saved");
    this.name = "MapRevisionConflictError";
  }
}
