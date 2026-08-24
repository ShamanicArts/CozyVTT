import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const banned = [
  /:\s*any\b/,
  /\bas\s+any\b/,
  /\bany\s*\[\s*\]/,
  /\b(?:Array|Promise|Record)\s*<[^>]*\bany\b[^>]*>/,
  /<[^>\n]*\bany\b[^>\n]*>/,
  /\[[^\]\n]*\bany\b[^\]\n]*\]/,
  /\b[A-Za-z_$][\w$]*\s*=\s*any\b/,
  /\bz\.any\s*\(/,
];
const violations = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if ([".ts", ".tsx"].includes(extname(entry.name))) {
      const lines = (await readFile(path, "utf8")).split("\n");
      lines.forEach((line, index) => {
        if (banned.some((pattern) => pattern.test(line))) {
          violations.push(`${path}:${index + 1}:${line.trim()}`);
        }
      });
    }
  }
}

await walk("src");
if (violations.length) {
  console.error("Explicit any usage is forbidden:\n" + violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("No explicit any or z.any() usage found.");
}
