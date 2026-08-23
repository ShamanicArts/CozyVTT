import { Request, Response, NextFunction } from "express";
import { productionAccessQueries } from "../composition/productionAccessQueries";
import logger from "../utils/logger";

export const PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED";

const ALLOWED_PATHS = new Set([
  "/auth/change-password",
  "/auth/logout",
  "/auth/me",
  "/auth/ping",
  "/auth/appearance",
  "/config",
]);

async function isPasswordChangePending(req: Request): Promise<boolean> {
  if (typeof req.session.mustChangePassword === "boolean") {
    return req.session.mustChangePassword;
  }

  try {
    const mustChangePassword = await productionAccessQueries.mustChangePassword(
      req.session.userId!,
    );
    if (mustChangePassword === null) return false;
    req.session.mustChangePassword = mustChangePassword;
    return mustChangePassword;
  } catch (error) {
    logger.error("Error checking password-change status", { err: error });
    return false;
  }
}

export async function requirePasswordChanged(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.session?.userId || ALLOWED_PATHS.has(req.path)) {
    return next();
  }

  if (await isPasswordChangePending(req)) {
    res.status(403).json({
      error: "Password Change Required",
      code: PASSWORD_CHANGE_REQUIRED,
      message: "You must set a new password before continuing.",
    });
    return;
  }

  next();
}
