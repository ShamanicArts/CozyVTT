import { Response, Router } from "express";
import type {
  ExtensionGrantPermission,
  ExtensionGrantPrincipal,
} from "../ports/ExtensionAdministrationRepository";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { productionExtensionAdministration } from "../composition/productionExtensionAdministration";
import {
  ExtensionOperationError,
} from "../application/extensions/ExtensionOperations";
import { productionExtensionOperations } from "../composition/productionExtensionOperations";

const router = Router();
const administration = productionExtensionAdministration;

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
  try {
    return res.json({ packages: await productionExtensionOperations.available() });
  } catch (error) {
    return sendHostError(res, error);
  }
});

router.get("/", async (_req, res) => {
  try {
    return res.json({ installations: await productionExtensionOperations.list() });
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
      .json({ installation: await productionExtensionOperations.install(packageId, mode) });
  } catch (error) {
    return sendHostError(res, error);
  }
});

router.post("/:extensionId/activate", async (req, res) =>
  lifecycle(res, req.params.extensionId, (id) => productionExtensionOperations.activate(id)),
);
router.post("/:extensionId/deactivate", async (req, res) =>
  lifecycle(res, req.params.extensionId, (id) => productionExtensionOperations.deactivate(id)),
);
router.delete("/:extensionId", async (req, res) =>
  lifecycle(res, req.params.extensionId, async (id) => {
    await productionExtensionOperations.uninstall(id);
    return undefined;
  }),
);

async function lifecycle<T>(
  res: Response,
  extensionId: string,
  action: (id: string) => Promise<T>,
): Promise<Response> {
  if (!validExtensionId(extensionId))
    return res
      .status(400)
      .json({ error: "Validation Error", message: "Invalid extension id" });
  try {
    const result = await action(extensionId);
    return result === undefined
      ? res.status(204).send()
      : res.json({ installation: result });
  } catch (error) {
    return sendHostError(res, error);
  }
}

function sendHostError(res: Response, error: unknown): Response {
  if (error instanceof ExtensionOperationError)
    return res
      .status(error.status)
      .json({ error: error.error, message: error.message });
  return res.status(500).json({
    error: "Internal Server Error",
    message: "Extension operation failed",
  });
}

function validExtensionId(value: unknown): string | null {
  return typeof value === "string" &&
    /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(value)
    ? value
    : null;
}

function readGrantInput(value: unknown): {
  principalType: ExtensionGrantPrincipal;
  principalId: string;
  scopeCampaignId: string;
  extensionId: string;
  permission: ExtensionGrantPermission;
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
    !["USER", "PLUGIN", "SYSTEM"].includes(String(value.principalType)) ||
    !["READ", "WRITE", "EXECUTE", "ADMIN"].includes(String(value.permission))
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
    principalType: value.principalType as ExtensionGrantPrincipal,
    principalId: value.principalId,
    scopeCampaignId: value.scopeCampaignId,
    extensionId,
    permission: value.permission as ExtensionGrantPermission,
    expiresAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default router;
