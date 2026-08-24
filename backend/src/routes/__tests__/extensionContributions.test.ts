import express from "express";
import session from "express-session";
import request from "supertest";

const campaignMembership = jest.fn();
const campaignContributions = jest.fn();
const presentation = jest.fn();

jest.mock("../../composition/productionAccessQueries", () => ({
  productionAccessQueries: { campaignMembership },
}));
jest.mock("../../composition/productionExtensionOperations", () => ({
  productionExtensionOperations: {
    campaignContributions,
    presentation,
  },
}));

import extensionContributionRoutes from "../extensionContributions";

function app(authenticated = true): express.Express {
  const application = express();
  application.use(
    session({ secret: "test", resave: false, saveUninitialized: false }),
  );
  if (authenticated) {
    application.use((req, _res, next) => {
      req.session.userId = "user-1";
      next();
    });
  }
  application.use("/api/extensions", extensionContributionRoutes);
  return application;
}

describe("campaign extension contribution HTTP adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    campaignMembership.mockResolvedValue({
      campaignId: "campaign-1",
      role: "PLAYER",
      characterIds: [],
    });
  });

  it("requires authentication and campaign membership", async () => {
    expect(
      (
        await request(app(false)).get(
          "/api/extensions/campaigns/campaign-1/contributions",
        )
      ).status,
    ).toBe(401);

    campaignMembership.mockResolvedValueOnce(null);
    expect(
      (
        await request(app()).get(
          "/api/extensions/campaigns/campaign-1/contributions",
        )
      ).status,
    ).toBe(403);
  });

  it("uses the server-loaded campaign role for listing and module access", async () => {
    campaignContributions.mockResolvedValue({ presentations: [] });
    presentation.mockResolvedValue({
      checksum: "sha256:test",
      contents: Buffer.from("export const activateCampaignPresentation = () => {}"),
    });

    const listing = await request(app()).get(
      "/api/extensions/campaigns/campaign-1/contributions",
    );
    expect(listing.status).toBe(200);
    expect(campaignContributions).toHaveBeenCalledWith("campaign-1", "PLAYER");

    const moduleResponse = await request(app()).get(
      "/api/extensions/campaigns/campaign-1/contributions/presentations/cozyvtt.stage/campaign-stage",
    );
    expect(moduleResponse.status).toBe(200);
    expect(moduleResponse.headers["content-type"]).toContain("text/javascript");
    expect(presentation).toHaveBeenCalledWith(
      "cozyvtt.stage",
      "campaign-stage",
      "PLAYER",
    );
  });
});
