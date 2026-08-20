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
});
