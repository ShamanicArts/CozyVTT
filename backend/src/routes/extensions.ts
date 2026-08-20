import { Response, Router } from "express";
import { ExtensionPrincipalType, ExtensionPermission } from "@prisma/client";
import { prisma } from "../config/database";
import { ExtensionAdministrationService } from "../application/extensions/ExtensionAdministration";
import { PrismaExtensionAdministrationRepository } from "../adapters/persistence/PrismaExtensionAdministrationRepository";
import {
  ExtensionHostError,
  type ExtensionHostService,
} from "../extensions/host";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { productionExtensionRuntime } from "../composition/productionExtensionRuntime";

const router = Router();
const administration = new ExtensionAdministrationService(
  new PrismaExtensionAdministrationRepository(prisma),
);

router.use(requireAuth, requireAdmin);

router.get("/grants", async (req, res) => {
  const campaignId =
    typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
  return res.json({ grants: await administration.listGrants(campaignId) });
});

router.post("/grants", async (req, res) => {
  const input = readGrantInput(req.body);
  if (!input)
    return res.status(400).json({
      error: "Validation Error",
      message: "Invalid extension grant input",
    });
  const grant = await administration.grant({
    ...input,
    grantedById: req.session.userId!,
  });
  return res.status(201).json({ grant });
});

router.delete("/grants/:grantId", async (req, res) => {
  if (!(await administration.revokeGrant(req.params.grantId)))
    return res
      .status(404)
      .json({ error: "Not Found", message: "Extension grant not found" });
  return res.status(204).send();
});

router.get("/available", async (_req, res) => {
  const host = getHost(res);
  if (!host) return;
  try {
    return res.json({ packages: await host.listAvailable() });
  } catch (error) {
    return sendHostError(res, error);
  }
});

router.get("/", async (_req, res) => {
  const host = getHost(res);
  if (!host) return;
  try {
    return res.json({ installations: await host.list() });
  } catch (error) {
    return sendHostError(res, error);
  }
});

router.post("/install", async (req, res) => {
  const packageId = validExtensionId(req.body?.packageId);
  if (!packageId)
    return res.status(400).json({
      error: "Validation Error",
      message: "packageId must be a valid extension id",
    });
  const host = getHost(res);
  if (!host) return;
  const mode =
    req.body?.mode === "sandboxed"
      ? "sandboxed"
      : req.body?.mode === undefined || req.body?.mode === "trusted"
        ? "trusted"
        : null;
  if (!mode)
    return res.status(400).json({
      error: "Validation Error",
      message: "mode must be trusted or sandboxed",
    });
  try {
    return res
      .status(201)
      .json({ installation: await host.install(packageId, mode) });
  } catch (error) {
    return sendHostError(res, error);
  }
});

router.post("/:extensionId/activate", async (req, res) =>
  lifecycle(res, req.params.extensionId, (host, id) => host.activate(id)),
);
router.post("/:extensionId/deactivate", async (req, res) =>
  lifecycle(res, req.params.extensionId, (host, id) => host.deactivate(id)),
);
router.delete("/:extensionId", async (req, res) =>
  lifecycle(res, req.params.extensionId, async (host, id) => {
    await host.uninstall(id);
    return undefined;
  }),
);

function getHost(res: Response): ExtensionHostService | null {
  try {
    return productionExtensionRuntime().host;
  } catch {
    res.status(503).json({
      error: "Extension Host Unavailable",
      message: "Trusted extension packages are not configured on this server",
    });
    return null;
  }
}

async function lifecycle<T>(
  res: Response,
  extensionId: string,
  action: (host: ExtensionHostService, id: string) => Promise<T>,
): Promise<Response> {
  if (!validExtensionId(extensionId))
    return res
      .status(400)
      .json({ error: "Validation Error", message: "Invalid extension id" });
  const host = getHost(res);
  if (!host) return res;
  try {
    const result = await action(host, extensionId);
    return result === undefined
      ? res.status(204).send()
      : res.json({ installation: result });
  } catch (error) {
    return sendHostError(res, error);
  }
}

function sendHostError(res: Response, error: unknown): Response {
  if (error instanceof ExtensionHostError) {
    const status =
      error.code === "UNKNOWN_INSTALLATION"
        ? 404
        : error.code === "UNTRUSTED_PACKAGE" ||
            error.code === "CHECKSUM_MISMATCH"
          ? 403
          : 409;
    return res.status(status).json({
      error: "Extension Host Error",
      message: safeHostMessage(error.code),
    });
  }
  return res.status(500).json({
    error: "Internal Server Error",
    message: "Extension operation failed",
  });
}

function safeHostMessage(code: ExtensionHostError["code"]): string {
  if (code === "UNTRUSTED_PACKAGE" || code === "CHECKSUM_MISMATCH")
    return "The package is not approved for in-process execution";
  if (code === "UNKNOWN_INSTALLATION")
    return "Extension installation not found";
  return "The extension operation could not be completed";
}

function validExtensionId(value: unknown): string | null {
  return typeof value === "string" &&
    /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(value)
    ? value
    : null;
}

function readGrantInput(value: unknown): {
  principalType: ExtensionPrincipalType;
  principalId: string;
  scopeCampaignId: string;
  extensionId: string;
  permission: ExtensionPermission;
  expiresAt: Date | null;
} | null {
  if (
    !isRecord(value) ||
    typeof value.principalId !== "string" ||
    !value.principalId ||
    typeof value.scopeCampaignId !== "string"
  )
    return null;
  const extensionId = validExtensionId(value.extensionId);
  if (!extensionId) return null;
  if (
    !Object.values(ExtensionPrincipalType).includes(
      value.principalType as ExtensionPrincipalType,
    ) ||
    !Object.values(ExtensionPermission).includes(
      value.permission as ExtensionPermission,
    )
  )
    return null;
  let expiresAt: Date | null = null;
  if (value.expiresAt !== undefined && value.expiresAt !== null) {
    if (
      typeof value.expiresAt !== "string" ||
      Number.isNaN(Date.parse(value.expiresAt))
    )
      return null;
    expiresAt = new Date(value.expiresAt);
  }
  return {
    principalType: value.principalType as ExtensionPrincipalType,
    principalId: value.principalId,
    scopeCampaignId: value.scopeCampaignId,
    extensionId,
    permission: value.permission as ExtensionPermission,
    expiresAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default router;
