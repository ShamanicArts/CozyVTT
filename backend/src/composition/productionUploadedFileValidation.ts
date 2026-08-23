import { NodeUploadedFileInspector } from "../adapters/assets/NodeUploadedFileInspector";
import { UploadedFileValidation } from "../application/assets/UploadedFileValidation";
import { FILE_SIZE_LIMITS } from "../utils/fileUtils";

export const productionUploadedFileValidation = new UploadedFileValidation(
  new NodeUploadedFileInspector(),
  FILE_SIZE_LIMITS,
);
