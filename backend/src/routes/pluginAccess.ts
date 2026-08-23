import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  productionPluginAccess,
  productionPluginCredentials,
} from "../composition/productionPluginAccess";

const router = Router();
const access = productionPluginAccess;
const credentials = productionPluginCredentials;

router.get("/credentials", requireAuth, async (req, res) =>
  res.json({ credentials: await credentials.list(req.session.userId!) }),
);

router.delete("/credentials/:credentialId", requireAuth, async (req, res) =>
  (await credentials.revoke(req.params.credentialId, req.session.userId!))
    ? res.status(204).send()
    : res
        .status(404)
        .json({ error: "Not Found", message: "Credential not found" }),
);

router.get("/approvals/pending", requireAuth, async (req, res) =>
  res.json({
    approvals: await access.listPendingApprovals(
      req.session.userId!,
      new Date(),
    ),
  }),
);

router.post("/approvals/:approvalId/approve", requireAuth, async (req, res) =>
  (await access.approveApproval({
    approvalId: req.params.approvalId,
    delegatedUserId: req.session.userId!,
    now: new Date(),
  }))
    ? res.json({ approved: true })
    : res.status(404).json({
        error: "Not Found",
        message: "Pending approval not found",
      }),
);

router.post("/approvals/:approvalId/deny", requireAuth, async (req, res) =>
  (await access.denyApproval({
    approvalId: req.params.approvalId,
    delegatedUserId: req.session.userId!,
    now: new Date(),
  }))
    ? res.status(204).send()
    : res.status(404).json({
        error: "Not Found",
        message: "Pending approval not found",
      }),
);

export default router;
