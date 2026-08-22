// ============================================
// Asset URL helpers
//
// Asset references are stored in one of two shapes depending on how old the
// record is and which route wrote it:
//
//   "/api/assets/tokens/{uuid}"   the canonical form (see backend
//                                 utils/asset-urls.ts, which normalises on
//                                 write for characters, maps and tokens)
//   "{uuid}"                      a bare id, written by older paths
//
// Anything reading a stored reference has to cope with both, so the
// extraction lives here rather than being re-derived per component.
// ============================================

/**
 * Pull the asset id out of a stored reference, whichever shape it is in.
 * Returns null for empty/missing values.
 */
export function extractAssetId(url: string | null | undefined): string | null {
  if (!url) return null;
  const parts = url.split('/');
  return parts[parts.length - 1] || null;
}
