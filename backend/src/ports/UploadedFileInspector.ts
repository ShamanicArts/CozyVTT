export type UploadAssetType = "MAP" | "TOKEN" | "AUDIO" | "AVATAR";

export interface UploadedFileInspector {
  exists(filePath: string): Promise<boolean>;
  mimeType(filePath: string): Promise<string | null>;
  size(filePath: string): Promise<number>;
  remove(filePath: string): Promise<void>;
}
