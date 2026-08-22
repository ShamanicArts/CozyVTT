import { writeFile } from "fs/promises";
import { resolve } from "path";
import { productionApplicationHost } from "../composition/productionApplicationHost";
import { productionQueryHost } from "../composition/productionQueryHost";

async function main(): Promise<void> {
  const destination = resolve(
    __dirname,
    "../../../contracts/public-capabilities.json",
  );
  const contract = {
    contractVersion: 1,
    principalProtocolVersion: 1,
    commands: productionApplicationHost
      .list()
      .sort((left, right) => left.id.localeCompare(right.id)),
    queries: productionQueryHost
      .list()
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
  await writeFile(destination, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
}

void main();
