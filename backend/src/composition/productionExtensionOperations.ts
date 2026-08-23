import { ExtensionOperations } from "../application/extensions/ExtensionOperations";
import { productionExtensionRuntime } from "./productionExtensionRuntime";

export const productionExtensionOperations = new ExtensionOperations(
  () => productionExtensionRuntime().host,
);
