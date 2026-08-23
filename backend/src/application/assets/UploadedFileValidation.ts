import type {
  UploadAssetType,
  UploadedFileInspector,
} from "../../ports/UploadedFileInspector";

const ALLOWED_MIME_TYPES: Record<UploadAssetType, readonly string[]> = {
  MAP: ["image/png", "image/jpeg", "image/webp", "application/pdf"],
  TOKEN: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  AUDIO: ["audio/mpeg", "audio/ogg", "audio/wav"],
  AVATAR: ["image/png", "image/jpeg", "image/webp"],
};

export interface UploadedFileValidationError {
  status: 400 | 500;
  error: string;
  message: string;
}

export class UploadedFileValidation {
  constructor(
    private readonly files: UploadedFileInspector,
    private readonly sizeLimits: Readonly<Record<UploadAssetType, number>>,
  ) {}

  async type(
    filePath: string,
    originalName: string,
    assetType: UploadAssetType,
  ): Promise<UploadedFileValidationError | null> {
    if (!(await this.files.exists(filePath)))
      return {
        status: 500,
        error: "Internal Server Error",
        message: "Uploaded file not found",
      };
    const mime = await this.files.mimeType(filePath);
    if (!mime) {
      const extension = originalName
        .slice(originalName.lastIndexOf("."))
        .toLowerCase();
      if (
        (extension === ".pdf" && assetType === "MAP") ||
        (extension === ".mp3" && assetType === "AUDIO")
      )
        return null;
      await this.files.remove(filePath);
      return {
        status: 400,
        error: "Validation Error",
        message:
          "Could not determine file type. File may be corrupted or invalid.",
      };
    }
    if (ALLOWED_MIME_TYPES[assetType].includes(mime)) return null;
    await this.files.remove(filePath);
    return {
      status: 400,
      error: "Validation Error",
      message: `Invalid file type. ${assetType} files must be one of: ${allowedTypes(assetType)}`,
    };
  }

  async size(
    filePath: string,
    assetType: UploadAssetType,
  ): Promise<UploadedFileValidationError | null> {
    const limit = this.sizeLimits[assetType];
    if ((await this.files.size(filePath)) <= limit) return null;
    await this.files.remove(filePath);
    return {
      status: 400,
      error: "File Too Large",
      message: `${assetType} files must be smaller than ${(limit / (1024 * 1024)).toFixed(0)}MB`,
    };
  }

  remove(filePath: string) {
    return this.files.remove(filePath);
  }
}

function allowedTypes(assetType: UploadAssetType): string {
  return {
    MAP: "PNG, JPEG, WEBP, PDF",
    TOKEN: "PNG, JPEG, WEBP, GIF",
    AUDIO: "MP3, OGG, WAV",
    AVATAR: "PNG, JPEG, WEBP",
  }[assetType];
}
