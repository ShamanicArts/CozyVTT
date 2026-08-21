import {
  parseSandboxResponse,
  SANDBOX_PROTOCOL_VERSION,
  SandboxProtocolError,
} from "../protocol";

describe("sandbox NDJSON protocol", () => {
  it("accepts only versioned response frames and rejects malformed errors", () => {
    expect(
      parseSandboxResponse({
        version: SANDBOX_PROTOCOL_VERSION,
        id: "call-1",
        ok: true,
        result: { ok: true },
      }),
    ).toMatchObject({ id: "call-1", ok: true });
    expect(() =>
      parseSandboxResponse({ version: 2, id: "call-1", ok: true }),
    ).toThrow(SandboxProtocolError);
    expect(() =>
      parseSandboxResponse({
        version: SANDBOX_PROTOCOL_VERSION,
        id: "call-1",
        ok: false,
      }),
    ).toThrow(SandboxProtocolError);
  });

  it("accepts bounded declarative core actions and rejects malformed ones", () => {
    expect(
      parseSandboxResponse({
        version: SANDBOX_PROTOCOL_VERSION,
        id: "call-2",
        ok: true,
        result: { planned: true },
        coreActions: [
          {
            commandId: "agent.actor.move",
            input: { mapId: "map-1", tokenId: "npc-1", x: 4, y: 5 },
          },
        ],
      }).coreActions,
    ).toEqual([
      expect.objectContaining({ commandId: "agent.actor.move" }),
    ]);
    expect(() =>
      parseSandboxResponse({
        version: SANDBOX_PROTOCOL_VERSION,
        id: "call-3",
        ok: true,
        coreActions: [{ commandId: "agent.actor.move", input: "bad" }],
      }),
    ).toThrow(SandboxProtocolError);
  });
});
