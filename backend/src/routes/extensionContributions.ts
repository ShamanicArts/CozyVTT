import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { campaignMember } from "../middleware/compose";
import type { AuthenticatedRequest } from "../middleware/rbac";
import { productionExtensionOperations } from "../composition/productionExtensionOperations";

const router = Router();

/** Active installations may contribute validated, data-only themes. */
router.get("/contributions", requireAuth, async (_req, res) => {
  try {
    return res.json(await productionExtensionOperations.contributions());
  } catch {
    return res.json({ themes: [], renderers: [] });
  }
});

router.get(
  "/contributions/renderers/:extensionId/:rendererId",
  requireAuth,
  async (req, res) => {
    try {
      const module = await productionExtensionOperations.renderer(
        req.params.extensionId,
        req.params.rendererId,
      );
      res.set({
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "private, no-store",
        ETag: `\"${module.checksum}\"`,
        "X-Content-Type-Options": "nosniff",
      });
      return res.send(module.contents);
    } catch {
      return res.status(404).json({
        error: "Not Found",
        message: "Active renderer contribution not found",
      });
    }
  },
);

router.get(
  "/campaigns/:campaignId/contributions",
  ...campaignMember,
  async (req: AuthenticatedRequest, res) => {
    try {
      return res.json(
        await productionExtensionOperations.campaignContributions(
          req.params.campaignId,
          req.campaignMembership!.role,
        ),
      );
    } catch {
      return res.json({ presentations: [] });
    }
  },
);

router.get(
  "/campaigns/:campaignId/contributions/presentations/:extensionId/:presentationId",
  ...campaignMember,
  async (req: AuthenticatedRequest, res) => {
    try {
      const module = await productionExtensionOperations.presentation(
        req.params.extensionId,
        req.params.presentationId,
        req.campaignMembership!.role,
      );
      res.set({
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "private, no-store",
        ETag: `\"${module.checksum}\"`,
        "X-Content-Type-Options": "nosniff",
      });
      return res.send(module.contents);
    } catch {
      return res.status(404).json({
        error: "Not Found",
        message: "Active campaign presentation contribution not found",
      });
    }
  },
);

export default router;
