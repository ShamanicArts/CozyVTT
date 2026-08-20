/**
 * Binary asset boundary. Keys are storage-relative, never host file paths.
 * The first hexagonal slice does not migrate uploads yet; this contract lets
 * the current filesystem implementation be replaced by S3-compatible storage
 * without leaking either detail into application commands.
 */
export interface BlobStorage {
  put(key: string, contents: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
