import {
  ExportCampaignArchive,
  ImportCampaignArchive,
  PreviewCampaignArchiveImport,
} from "./CampaignArchiveCommands";
import { CampaignArchiveService } from "../../ports/CampaignArchiveService";

function archives(): jest.Mocked<CampaignArchiveService> {
  return {
    exportCampaign: jest.fn(async (_campaignId: string, _options) => ({
      buffer: Buffer.from("zip"),
      filename: "briar-hall-export.cozyvtt",
    })),
    previewCampaignImport: jest.fn(async (_archive: Buffer) => ({
      formatVersion: 1,
      exportedAt: "2025-01-01T00:00:00.000Z",
      exportedFrom: "CozyVTT",
      campaignName: "Briar Hall",
      gameSystem: "NONE",
      mapCount: 1,
      tokenCount: 2,
      creatureCount: 0,
      tokenTemplateCount: 0,
      assetCount: 0,
      includesAudio: false,
      totalSizeBytes: 0,
    })),
    importCampaign: jest.fn(
      async (_archive: Buffer, _userId: string, _options) => ({
        campaignId: "campaign-1",
        campaignName: "Briar Hall",
        mapCount: 1,
        tokenCount: 2,
        creatureCount: 0,
        tokenTemplateCount: 0,
      }),
    ),
  };
}

describe("campaign archive commands", () => {
  it("delegates export and preview through the archive port without changing options or archive data", async () => {
    const service = archives();
    await expect(
      new ExportCampaignArchive(service).execute({
        type: "campaign-archive.export",
        campaignId: "campaign-1",
        includeAudio: true,
        includeTokens: false,
      }),
    ).resolves.toMatchObject({ filename: "briar-hall-export.cozyvtt" });
    expect(service.exportCampaign).toHaveBeenCalledWith("campaign-1", {
      includeAudio: true,
      includeTokens: false,
    });

    const archive = Buffer.from("zip");
    await expect(
      new PreviewCampaignArchiveImport(service).execute({
        type: "campaign-archive.preview-import",
        archive,
      }),
    ).resolves.toMatchObject({ campaignName: "Briar Hall", mapCount: 1 });
    expect(service.previewCampaignImport).toHaveBeenCalledWith(archive);
  });

  it("preserves import option normalization and campaign name validation", async () => {
    const service = archives();
    const command = new ImportCampaignArchive(service);
    await command.execute({
      type: "campaign-archive.import",
      archive: Buffer.from("zip"),
      userId: "user-1",
      campaignName: "  Briar Hall  ",
      importTokens: "false",
    });
    expect(service.importCampaign).toHaveBeenCalledWith(
      Buffer.from("zip"),
      "user-1",
      {
        campaignName: "Briar Hall",
        importTokens: false,
      },
    );

    await expect(
      command.execute({
        type: "campaign-archive.import",
        archive: Buffer.from("zip"),
        userId: "user-1",
        campaignName: "",
        importTokens: undefined,
      }),
    ).rejects.toMatchObject({
      name: "CampaignArchiveError",
      message: "Campaign name must be between 1 and 200 characters.",
    });
  });
});
