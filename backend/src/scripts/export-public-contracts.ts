import { writeFile } from "fs/promises";
import { resolve } from "path";
import { productionApplicationHost } from "../composition/productionApplicationHost";
import { productionPublicQueryHost } from "../composition/productionQueryHost";
import { listPublicCoreCommandDescriptors } from "../application/capabilities/CoreCapabilityCatalog";

async function main(): Promise<void> {
  const destination = resolve(
    __dirname,
    "../../../contracts/public-capabilities.json",
  );
  const contract = {
    contractVersion: 1,
    principalProtocolVersion: 1,
    commands: listPublicCoreCommandDescriptors()
      .map((descriptor) => {
        const command = productionApplicationHost.get(descriptor.id);
        if (!command) {
          throw new Error(`Public command is not registered: ${descriptor.id}`);
        }
        return command;
      })
      .sort((left, right) => left.id.localeCompare(right.id)),
    queries: productionPublicQueryHost
      .list()
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
  await writeFile(
    destination,
    `${JSON.stringify(contract, null, 2)}\n`,
    "utf8",
  );
}

void main();
