/**
 * These commands mutate Map rows or their JSON token state without an
 * `expectedUpdatedAt`/version precondition in their public transport contract.
 * They are intentionally listed here so agent callers do not assume a lost
 * update is prevented merely because Map has an `updatedAt` column.
 *
 * Adding compare-and-swap requires a version field to be carried through the
 * HTTP and Socket.IO contracts first; it must not be introduced as an
 * undocumented breaking requirement for existing VTT clients.
 */
export const NON_VERSIONED_MAP_TOKEN_COMMANDS = [
  "map.update",
  "map.delete",
  "map.set-current",
  "map-token.create",
  "map-token.update",
  "map-token.delete",
  "token.move.finalize",
  "scene.wall.add",
  "scene.wall.remove",
  "scene.wall.update",
  "scene.walls.replace",
  "scene.fog.apply-operation",
  "scene.light.add",
  "scene.light.remove",
  "scene.light.update",
  "scene.lights.replace",
  "scene.lighting.set-enabled",
] as const;
