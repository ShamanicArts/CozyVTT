import { Router } from "express";
import { prisma } from "../config/database";
import { createTrustedExtensionHost } from "../extensions/host";
import { requireAuth } from "../middleware/auth";

const router = Router();

/** Active installations may contribute validated, data-only themes. */
router.get("/contributions", requireAuth, async (_req, res) => {
  try {
    const host = createTrustedExtensionHost(prisma);
    const renderers = await host.listActiveRendererContributions();
    return res.json({
      themes: await host.listActiveThemeContributions(),
      renderers: renderers.map(({ extensionId, renderer }) => ({
        extensionId,
        renderer: {
          id: renderer.id,
          name: renderer.name,
          contractVersion: renderer.contractVersion,
          moduleUrl: `/api/extensions/contributions/renderers/${encodeURIComponent(extensionId)}/${encodeURIComponent(renderer.id)}`,
        },
      })),
    });
  } catch {
    return res.json({ themes: [], renderers: [] });
  }
});

router.get(
  "/contributions/renderers/:extensionId/:rendererId",
  requireAuth,
  async (req, res) => {
    try {
      const host = createTrustedExtensionHost(prisma);
      const module = await host.readActiveRendererModule(
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

export default router;
