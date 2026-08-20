export const SANDBOX_PROTOCOL_VERSION = 1 as const;
export interface SandboxRequest {
  version: typeof SANDBOX_PROTOCOL_VERSION;
  id: string;
  method: "activate" | "deactivate" | "command";
  params: Record<string, unknown>;
}
export interface SandboxResponse {
  version: typeof SANDBOX_PROTOCOL_VERSION;
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}
export class SandboxProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxProtocolError";
  }
}
export function parseSandboxResponse(value: unknown): SandboxResponse {
  if (
    !isRecord(value) ||
    value.version !== SANDBOX_PROTOCOL_VERSION ||
    typeof value.id !== "string" ||
    typeof value.ok !== "boolean"
  )
    throw new SandboxProtocolError("Invalid sandbox response");
  if (
    !value.ok &&
    (!isRecord(value.error) ||
      typeof value.error.code !== "string" ||
      typeof value.error.message !== "string")
  )
    throw new SandboxProtocolError("Invalid sandbox error response");
  return {
    version: SANDBOX_PROTOCOL_VERSION,
    id: value.id,
    ok: value.ok,
    result: value.result,
    error: value.ok
      ? undefined
      : {
          code: (value.error as Record<string, unknown>).code as string,
          message: (value.error as Record<string, unknown>).message as string,
        },
  };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
