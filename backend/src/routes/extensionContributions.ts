import { Router } from "express";
import { prisma } from "../config/database";
import { createTrustedExtensionHost } from "../extensions/host";
import { requireAuth } from "../middleware/auth";

const router = Router();

/** Active installations may contribute validated, data-only themes. */
router.get("/contributions", requireAuth, async (_req, res) => {
  try {
    const host = createTrustedExtensionHost(prisma);
    return res.json({ themes: await host.listActiveThemeContributions() });
  } catch {
    return res.json({ themes: [] });
  }
});

export default router;
