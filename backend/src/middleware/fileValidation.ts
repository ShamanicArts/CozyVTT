import type { Response, NextFunction } from "express";
import type { UploadRequest } from "./upload";
import logger from "../utils/logger";
import { productionUploadedFileValidation } from "../composition/productionUploadedFileValidation";

export async function validateFileType(
  req: UploadRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.file) {
    res.status(400).json({
      error: "Validation Error",
      message: "No file uploaded",
    });
    return;
  }
  try {
    const error = await productionUploadedFileValidation.type(
      req.file.path,
      req.file.originalname,
      req.assetType || "MAP",
    );
    if (error) {
      res.status(error.status).json({ error: error.error, message: error.message });
      return;
    }
    next();
  } catch (error) {
    logger.error("Error validating file type", { err: error });
    await cleanup(req.file.path);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to validate file type",
    });
  }
}

export async function validateFileSize(
  req: UploadRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.file) {
    res.status(400).json({
      error: "Validation Error",
      message: "No file uploaded",
    });
    return;
  }
  try {
    const error = await productionUploadedFileValidation.size(
      req.file.path,
      req.assetType || "MAP",
    );
    if (error) {
      res.status(error.status).json({ error: error.error, message: error.message });
      return;
    }
    next();
  } catch (error) {
    logger.error("Error validating file size", { err: error });
    await cleanup(req.file.path);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to validate file size",
    });
  }
}

async function cleanup(filePath: string): Promise<void> {
  try {
    await productionUploadedFileValidation.remove(filePath);
  } catch (error) {
    logger.error("Error deleting invalid uploaded file", { err: error });
  }
}
