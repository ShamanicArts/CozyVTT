import { Router } from "express";
import { productionOAuthService } from "../composition/productionOAuth";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/requests/:requestId", requireAuth, async (req, res) => {
  const view = await productionOAuthService().describeAuthorization(req.params.requestId, req.session.userId!);
  return view ? res.json(view) : unavailable(res);
});

router.post("/requests/:requestId/approve", requireAuth, async (req, res) => {
  const campaignId = typeof req.body?.campaignId === "string" ? req.body.campaignId : "";
  if (!campaignId) return res.status(400).json({ error: "Validation Error", message: "Choose a campaign for this connection" });
  try {
    return res.json({ redirectUrl: await productionOAuthService().approveAuthorization(req.params.requestId, req.session.userId!, campaignId) });
  } catch {
    return unavailable(res);
  }
});

router.post("/requests/:requestId/deny", requireAuth, async (req, res) => {
  try {
    return res.json({ redirectUrl: await productionOAuthService().denyAuthorization(req.params.requestId) });
  } catch {
    return unavailable(res);
  }
});

function unavailable(res: import("express").Response) {
  return res.status(404).json({ error: "Not Found", message: "This connection request is unavailable or expired" });
}

export default router;
