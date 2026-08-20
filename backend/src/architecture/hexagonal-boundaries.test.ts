import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const sourceRoot = path.resolve(__dirname, "..");

function typescriptFiles(relativeDirectories: readonly string[]): string[] {
  const files: string[] = [];

  function visit(absolutePath: string): void {
    for (const entry of readdirSync(absolutePath)) {
      const child = path.join(absolutePath, entry);
      if (statSync(child).isDirectory()) {
        visit(child);
      } else if (child.endsWith(".ts") && !child.endsWith(".test.ts")) {
        files.push(child);
      }
    }
  }

  for (const directory of relativeDirectories) {
    visit(path.join(sourceRoot, directory));
  }
  return files;
}

function matchingLines(files: readonly string[], pattern: RegExp): string[] {
  const matches: string[] = [];
  for (const file of files) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          matches.push(
            `${path.relative(sourceRoot, file)}:${index + 1}: ${line.trim()}`,
          );
        }
      });
  }
  return matches;
}

describe("hexagonal architecture boundaries", () => {
  it("keeps framework and infrastructure imports out of domain, application, and ports", () => {
    const coreFiles = typescriptFiles(["domain", "application", "ports"]);
    const forbiddenImport =
      /(?:from\s+|require\()['"](?:@prisma\/client|express|socket\.io|node:fs|fs)['"]/;

    expect(matchingLines(coreFiles, forbiddenImport)).toEqual([]);
  });

  it("keeps direct Prisma mutations out of REST and websocket adapters", () => {
    const transportFiles = typescriptFiles(["routes", "websocket"]);
    const directMutation =
      /\bprisma\.[A-Za-z0-9_]+\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;

    expect(matchingLines(transportFiles, directMutation)).toEqual([]);
  });
});
