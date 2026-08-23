import type { UploadedFileInspector } from "../../ports/UploadedFileInspector";
import { UploadedFileValidation } from "./UploadedFileValidation";

const limits = {
  MAP: 50 * 1024 * 1024,
  TOKEN: 5 * 1024 * 1024,
  AUDIO: 20 * 1024 * 1024,
  AVATAR: 2 * 1024 * 1024,
};

function inspector(overrides: Partial<UploadedFileInspector> = {}) {
  return {
    exists: jest.fn(async () => true),
    mimeType: jest.fn(async () => "image/png"),
    size: jest.fn(async () => 10),
    remove: jest.fn(async () => undefined),
    ...overrides,
  } satisfies UploadedFileInspector;
}

describe("UploadedFileValidation", () => {
  it("accepts an allowed detected type without removing the upload", async () => {
    const files = inspector();
    const validation = new UploadedFileValidation(files, limits);

    await expect(validation.type("upload", "map.png", "MAP")).resolves.toBeNull();
    expect(files.remove).not.toHaveBeenCalled();
  });

  it("retains PDF and MP3 detection exceptions but rejects unknown files", async () => {
    const files = inspector({ mimeType: jest.fn(async () => null) });
    const validation = new UploadedFileValidation(files, limits);

    await expect(validation.type("upload", "map.PDF", "MAP")).resolves.toBeNull();
    await expect(validation.type("upload", "track.mp3", "AUDIO")).resolves.toBeNull();
    await expect(validation.type("upload", "payload.bin", "MAP")).resolves.toEqual({
      status: 400,
      error: "Validation Error",
      message: "Could not determine file type. File may be corrupted or invalid.",
    });
    expect(files.remove).toHaveBeenCalledTimes(1);
  });

  it("removes disallowed types and oversized uploads", async () => {
    const files = inspector({
      mimeType: jest.fn(async () => "application/pdf"),
      size: jest.fn(async () => limits.TOKEN + 1),
    });
    const validation = new UploadedFileValidation(files, limits);

    await expect(validation.type("upload", "token.pdf", "TOKEN")).resolves.toMatchObject({
      status: 400,
      message: "Invalid file type. TOKEN files must be one of: PNG, JPEG, WEBP, GIF",
    });
    await expect(validation.size("upload", "TOKEN")).resolves.toEqual({
      status: 400,
      error: "File Too Large",
      message: "TOKEN files must be smaller than 5MB",
    });
    expect(files.remove).toHaveBeenCalledTimes(2);
  });

  it("reports a missing temporary upload as an infrastructure failure", async () => {
    const files = inspector({ exists: jest.fn(async () => false) });
    const validation = new UploadedFileValidation(files, limits);

    await expect(validation.type("missing", "map.png", "MAP")).resolves.toEqual({
      status: 500,
      error: "Internal Server Error",
      message: "Uploaded file not found",
    });
  });
});
