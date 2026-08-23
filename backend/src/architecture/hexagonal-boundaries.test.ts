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
      /(?:from\s+|require\()['"](?:@prisma\/client|express|socket\.io|node:fs|fs|\.\.\/\.\.\/(?:adapters|composition|config|services|websocket|extensions\/host)\/)/;

    expect(matchingLines(coreFiles, forbiddenImport)).toEqual([]);
  });

  it("keeps all persistence and infrastructure dependencies out of transports", () => {
    const transportFiles = typescriptFiles(["routes", "websocket", "middleware"]);
    const forbiddenDependency =
      /(?:from\s+|require\()['"](?:@prisma\/client|(?:\.\.\/)+config\/database|(?:\.\.\/)+adapters\/|(?:\.\.\/)+services\/|(?:\.\.\/)+extensions\/host|(?:node:)?fs(?:\/promises)?|sharp)['"]/;

    expect(matchingLines(transportFiles, forbiddenDependency)).toEqual([]);
  });

  it("forces transport mutations through the application host facade", () => {
    const transportFiles = typescriptFiles(["routes", "websocket", "middleware"]);
    expect(
      matchingLines(
        transportFiles,
        /productionCommandBus|composition\/productionApplicationHost/,
      ),
    ).toEqual([]);
  });

  it("keeps the raw production command registry private to composition", () => {
    const composition = readFileSync(
      path.join(sourceRoot, "composition", "productionApplicationHost.ts"),
      "utf8",
    );
    expect(composition).not.toMatch(/export\s+const\s+productionCommandBus/);
  });
});
