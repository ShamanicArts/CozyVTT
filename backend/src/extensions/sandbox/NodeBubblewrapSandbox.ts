import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { randomUUID } from "crypto";
import path from "path";
import { validateJsonSchema } from "../bridge/JsonSchemaValidator";
import type { JsonSchema } from "../contracts";
import {
  ExtensionHostError,
  type DiscoveredExtensionPackage,
} from "../host/contracts";
import type { ExtensionPackageCatalog } from "../host/ports";
import {
  SANDBOX_PROTOCOL_VERSION,
  parseSandboxResponse,
  type SandboxRequest,
  type SandboxResponse,
} from "./protocol";

const MAX_STDOUT_BYTES = 1_048_576;
const MAX_STDERR_BYTES = 65_536;
const DEFAULT_TIMEOUT_MS = 5_000;

export class SandboxUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxUnavailableError";
  }
}
export class SandboxExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxExecutionError";
  }
}

/** Runs third-party code only in a fresh, unshared bubblewrap process. */
export class NodeBubblewrapSandbox {
  private running = 0;
  public constructor(
    private readonly packages: ExtensionPackageCatalog,
    private readonly maxConcurrent = 2,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async invoke(input: {
    extensionId: string;
    packagePath: string;
    checksum: string;
    method: SandboxRequest["method"];
    params: Record<string, unknown>;
    inputSchema: JsonSchema;
    outputSchema: JsonSchema;
  }): Promise<unknown> {
    if (this.running >= this.maxConcurrent)
      throw new SandboxExecutionError("Sandbox capacity is exhausted");
    this.running += 1;
    try {
      const discovered = await this.packages.discoverInstalled(
        input.packagePath,
      );
      if (
        discovered.packageManifest.manifest.id !== input.extensionId ||
        discovered.computedChecksum !== input.checksum
      )
        throw new ExtensionHostError(
          "Sandbox package changed after installation",
          "CHECKSUM_MISMATCH",
        );
      validateJsonSchema(input.inputSchema, input.params);
      const response = await this.call(discovered, input.method, input.params);
      if (!response.ok)
        throw new SandboxExecutionError("Sandbox command failed");
      validateJsonSchema(input.outputSchema, response.result);
      return response.result;
    } finally {
      this.running -= 1;
    }
  }

  private async call(
    discovered: DiscoveredExtensionPackage,
    method: SandboxRequest["method"],
    params: Record<string, unknown>,
  ): Promise<SandboxResponse> {
    const child = launchSandbox(discovered);
    const id = randomUUID();
    const request: SandboxRequest = {
      version: SANDBOX_PROTOCOL_VERSION,
      id,
      method,
      params,
    };
    return await readSingleResponse(child, request, this.timeoutMs);
  }
}

function launchSandbox(
  discovered: DiscoveredExtensionPackage,
): ChildProcessWithoutNullStreams {
  if (process.platform !== "linux")
    throw new SandboxUnavailableError(
      "Sandbox execution requires Linux bubblewrap",
    );
  const entrypoint = `/package/${path.relative(discovered.packagePath, discovered.entrypointPath).split(path.sep).join("/")}`;
  // Official Node container images place Node under /usr/local; local version
  // managers often place process.execPath beneath a user home that is correctly
  // absent from the child namespace. In that case use the system Node already
  // mounted at /usr/bin, which is the supported host sandbox runtime.
  const nodeExecutable = process.execPath.startsWith("/usr/local/bin/")
    ? process.execPath
    : "/usr/bin/node";
  const nodeRuntimeRoot = nodeExecutable.startsWith("/usr/local/")
    ? "/usr/local"
    : "/usr";
  const nodeArgs = [
    "--permission",
    "--allow-fs-read=/package",
    "--max-old-space-size=64",
    entrypoint,
  ];
  const args = [
    "--die-with-parent",
    "--new-session",
    "--unshare-net",
    "--ro-bind",
    discovered.packagePath,
    "/package",
    "--tmpfs",
    "/tmp",
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    "--ro-bind",
    "/usr",
    "/usr",
    ...(nodeRuntimeRoot === "/usr"
      ? []
      : ["--ro-bind", nodeRuntimeRoot, nodeRuntimeRoot]),
    "--ro-bind-try",
    "/lib",
    "/lib",
    "--ro-bind-try",
    "/lib64",
    "/lib64",
    "--ro-bind",
    "/bin",
    "/bin",
    "--chdir",
    "/tmp",
    nodeExecutable,
    ...nodeArgs,
  ];
  return spawn("/usr/bin/bwrap", args, {
    env: { PATH: "/usr/bin:/bin", NODE_NO_WARNINGS: "1" },
    stdio: "pipe",
  });
}

function readSingleResponse(
  child: ChildProcessWithoutNullStreams,
  request: SandboxRequest,
  timeoutMs: number,
): Promise<SandboxResponse> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (error?: Error, response?: SandboxResponse) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      error ? reject(error) : resolve(response!);
    };
    const timer = setTimeout(
      () => finish(new SandboxExecutionError("Sandbox call timed out")),
      timeoutMs,
    );
    child.once("error", () =>
      finish(new SandboxUnavailableError("Sandbox launcher is unavailable")),
    );
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (Buffer.byteLength(stderr) > MAX_STDERR_BYTES)
        finish(new SandboxExecutionError("Sandbox stderr limit exceeded"));
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout) > MAX_STDOUT_BYTES)
        return finish(
          new SandboxExecutionError("Sandbox output limit exceeded"),
        );
      const line = stdout.indexOf("\n");
      if (line < 0) return;
      try {
        const response = parseSandboxResponse(
          JSON.parse(stdout.slice(0, line)),
        );
        if (response.id !== request.id)
          throw new Error("Sandbox response id mismatch");
        finish(undefined, response);
      } catch {
        finish(
          new SandboxExecutionError("Sandbox emitted invalid protocol output"),
        );
      }
    });
    child.once("exit", (code) => {
      if (!done)
        finish(
          new SandboxExecutionError(
            `Sandbox exited before responding (${code ?? "signal"})`,
          ),
        );
    });
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}
