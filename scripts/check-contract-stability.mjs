#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const artifact = "contracts/public-capabilities.json";
const tags = execFileSync(
  "git",
  ["tag", "--list", "contracts-v*", "--sort=-version:refname"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean)
  .slice(0, 3);

if (tags.length < 3) {
  console.error(`contract stability gate: ${tags.length}/3 tagged releases`);
  process.exit(1);
}

const contracts = tags.map((tag) => ({
  tag,
  value: JSON.parse(
    execFileSync("git", ["show", `${tag}:${artifact}`], { encoding: "utf8" }),
  ),
}));

for (let index = 0; index < contracts.length - 1; index += 1) {
  assertCompatible(contracts[index + 1], contracts[index]);
}
console.log(`contract stability gate passed: ${tags.reverse().join(" -> ")}`);

function assertCompatible(older, newer) {
  if (older.value.principalProtocolVersion !== newer.value.principalProtocolVersion)
    fail(older.tag, newer.tag, "principal protocol version changed");
  for (const kind of ["commands", "queries"]) {
    const current = new Map(newer.value[kind].map((item) => [item.id, item]));
    for (const previous of older.value[kind]) {
      const next = current.get(previous.id);
      if (!next) fail(older.tag, newer.tag, `${kind} capability removed: ${previous.id}`);
      for (const field of ["version", "inputSchema", "outputSchema"])
        if (JSON.stringify(previous[field]) !== JSON.stringify(next[field]))
          fail(
            older.tag,
            newer.tag,
            `${kind} ${previous.id} changed breaking field ${field}`,
          );
    }
  }
}

function fail(older, newer, reason) {
  console.error(`contract stability gate failed ${older} -> ${newer}: ${reason}`);
  process.exit(1);
}
