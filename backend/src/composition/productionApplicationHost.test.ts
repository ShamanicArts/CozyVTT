import {
  productionApplicationHost,
  productionCommandBus,
  productionCommandIds,
} from "./productionApplicationHost";
import { CREATE_MAP } from "../application/maps/MapLifecycleCommands";
import { ADD_WALL_SEGMENT } from "../application/scene/SceneMutations";
import { START_TOKEN_MOVE } from "../application/tokens/TokenMovement";
import { CREATE_CAMPAIGN } from "../application/campaigns/CampaignCommands";
import { START_CAMPAIGN_SESSION } from "../application/campaigns/SessionLifecycleCommands";
import { SET_ATMOSPHERE_EFFECT } from "../application/campaigns/RealtimeCampaignCommands";
import { CREATE_TOKEN_TEMPLATE } from "../application/tokenTemplates/CreateTokenTemplate";
import { UPDATE_CHARACTER_HP } from "../application/characters/RealtimeCharacterCommands";
import {
  SET_SPIRIT_LAYER_ENABLED,
  SET_SPIRIT_TOKEN_VISIBLE,
} from "../application/scene/RealtimeSpiritCommands";
import { listPublicCoreCommandDescriptors } from "../application/capabilities/CoreCapabilityCatalog";

describe("production application host catalog", () => {
  it("exposes every migrated command once through the shared catalog", () => {
    const ids = productionApplicationHost.list().map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(productionCommandIds));
    for (const id of productionCommandIds) {
      expect(productionApplicationHost.get(id)?.id).toBe(id);
      expect(productionCommandBus.has(id)).toBe(true);
    }
    for (const id of [
      CREATE_MAP,
      ADD_WALL_SEGMENT,
      START_TOKEN_MOVE,
      CREATE_CAMPAIGN,
      START_CAMPAIGN_SESSION,
      SET_ATMOSPHERE_EFFECT,
      CREATE_TOKEN_TEMPLATE,
      UPDATE_CHARACTER_HP,
      SET_SPIRIT_LAYER_ENABLED,
      SET_SPIRIT_TOKEN_VISIBLE,
    ]) {
      expect(productionApplicationHost.get(id)?.id).toBe(id);
      expect(productionCommandBus.has(id)).toBe(true);
    }
  });

  it("publishes concrete execution policy and schemas for every command", () => {
    for (const metadata of productionApplicationHost.list()) {
      expect(metadata.permissions.length).toBeGreaterThan(0);
      expect(metadata.inputSchema).toEqual(
        expect.objectContaining({ type: "object" }),
      );
      expect(metadata.outputSchema).toEqual(expect.any(Object));
      expect(metadata.idempotency).toBeDefined();
      if (metadata.idempotency) {
        expect(metadata.outbox).toMatchObject({
          topic: "application.command.executed.v1",
        });
      }
    }
    expect(productionApplicationHost.get(START_TOKEN_MOVE)).toMatchObject({
      risk: "MEDIUM",
      permissions: ["WRITE", "EXECUTE"],
      idempotency: true,
    });
    expect(
      productionApplicationHost.get(SET_SPIRIT_LAYER_ENABLED),
    ).toMatchObject({
      risk: "HIGH",
      permissions: ["WRITE", "EXECUTE"],
      idempotency: true,
    });
  });

  it("projects public capability schemas and policy from the core descriptors", () => {
    for (const descriptor of listPublicCoreCommandDescriptors()) {
      expect(productionApplicationHost.get(descriptor.id)).toMatchObject({
        id: descriptor.id,
        version: descriptor.version,
        title: descriptor.title,
        description: descriptor.description,
        risk: descriptor.risk.toUpperCase(),
        approvalPolicy: descriptor.approvalRequired ? "ALWAYS" : "NEVER",
        idempotency: descriptor.idempotencyRequired,
        inputSchema: descriptor.inputSchema,
        outputSchema: descriptor.outputSchema,
      });
    }
  });
});
