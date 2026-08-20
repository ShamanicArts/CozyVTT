/** File lifecycle boundary used to roll back persisted asset metadata safely. */
export interface AssetFileStore {
  remove(path: string): Promise<void>;
}
