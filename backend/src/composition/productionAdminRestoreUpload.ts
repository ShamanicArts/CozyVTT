import fs from "fs/promises";
import multer from "multer";

const uploadsDir = process.env.UPLOAD_DIR || "uploads";
const backupDir = `${uploadsDir}/backups`;
export const productionAdminRestoreUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      fs.mkdir(backupDir, { recursive: true })
        .then(() => callback(null, backupDir))
        .catch((error) => callback(error, backupDir));
    },
    filename: (_req, _file, callback) =>
      callback(null, `restore-temp-${Date.now()}.zip`),
  }),
  limits: { fileSize: 4 * 1024 * 1024 * 1024 },
  fileFilter: (_req, file, callback) =>
    file.originalname.toLowerCase().endsWith(".zip")
      ? callback(null, true)
      : callback(new Error("Only .zip backup files are accepted")),
});
