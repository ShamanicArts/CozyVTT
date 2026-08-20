import { createHash } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { LocalExtensionPackageCatalog } from "../../host/adapters/LocalExtensionPackageCatalog";
import {
  NodeBubblewrapSandbox,
  SandboxExecutionError,
} from "../NodeBubblewrapSandbox";

const fixturePath = path.join(__dirname, "fixtures", "runner.js");
const schema = {
  type: "object",
  properties: { action: { type: "string" } },
  required: ["action"],
  additionalProperties: false,
} as const;

describe("NodeBubblewrapSandbox", () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(
      roots
        .splice(0)
        .map((root) => fs.rm(root, { recursive: true, force: true })),
    );
  });

  async function sandbox(): Promise<{
    sandbox: NodeBubblewrapSandbox;
    packagePath: string;
    checksum: string;
  }> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cozy-sandbox-"));
    roots.push(root);
    const packagePath = path.join(root, "fixture");
    await fs.mkdir(packagePath);
    const body = await fs.readFile(fixturePath);
    await fs.writeFile(path.join(packagePath, "runner.js"), body);
    const checksum = `sha256:${createHash("sha256").update("runner.js").update("\0").update(body).update("\0").digest("hex")}`;
    await fs.writeFile(
      path.join(packagePath, "cozyvtt.extension.json"),
      JSON.stringify({
        packageFormat: "cozyvtt-extension-package/1",
        manifest: {
          manifestVersion: "1.0",
          id: "cozyvtt.sandbox-fixture",
          name: "Fixture",
          version: "1.0.0",
          description: "Sandbox fixture",
          compatibility: { extensionApi: "^1.0.0", cozyVtt: "^1.1.0" },
          capabilities: [],
          permissions: [],
          commands: [],
          agentTools: [],
        },
        entrypoint: "runner.js",
        checksum,
        dependencies: {},
        contributions: { themes: [] },
      }),
    );
    return {
      sandbox: new NodeBubblewrapSandbox(
        new LocalExtensionPackageCatalog(root),
        1,
        300,
      ),
      packagePath,
      checksum,
    };
  }

  it("runs valid commands, denies filesystem/network/child process, and contains crashes", async () => {
    const subject = await sandbox();
    const invoke = (action: string) =>
      subject.sandbox.invoke({
        extensionId: "cozyvtt.sandbox-fixture",
        packagePath: subject.packagePath,
        checksum: subject.checksum,
        method: "command",
        params: { action },
        inputSchema: schema,
        outputSchema: {},
      });
    await expect(invoke("ok")).resolves.toBe("ok");
    await expect(invoke("filesystem")).resolves.toBe("filesystem-denied");
    await expect(invoke("network")).resolves.toBe("network-denied");
    await expect(invoke("child-process")).resolves.toBe("child-denied");
    await expect(invoke("crash")).rejects.toBeInstanceOf(SandboxExecutionError);
    await expect(invoke("ok")).resolves.toBe("ok");
  });

  it("kills timeouts and oversized output", async () => {
    const subject = await sandbox();
    const invoke = (action: string) =>
      subject.sandbox.invoke({
        extensionId: "cozyvtt.sandbox-fixture",
        packagePath: subject.packagePath,
        checksum: subject.checksum,
        method: "command",
        params: { action },
        inputSchema: schema,
        outputSchema: {},
      });
    await expect(invoke("timeout")).rejects.toBeInstanceOf(
      SandboxExecutionError,
    );
    await expect(invoke("large-output")).rejects.toBeInstanceOf(
      SandboxExecutionError,
    );
  });

  it("rejects invalid input before launch and invalid output contracts", async () => {
    const subject = await sandbox();
    const base = {
      extensionId: "cozyvtt.sandbox-fixture",
      packagePath: subject.packagePath,
      checksum: subject.checksum,
      method: "command" as const,
    };
    await expect(
      subject.sandbox.invoke({
        ...base,
        params: {},
        inputSchema: schema,
        outputSchema: {},
      }),
    ).rejects.toBeDefined();
    await expect(
      subject.sandbox.invoke({
        ...base,
        params: { action: "ok" },
        inputSchema: schema,
        outputSchema: { type: "number" },
      }),
    ).rejects.toBeDefined();
  });
});
