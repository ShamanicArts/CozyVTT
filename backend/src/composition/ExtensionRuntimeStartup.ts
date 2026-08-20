import { productionExtensionRuntime } from "./productionExtensionRuntime";
import logger from "../utils/logger";

/**
 * Restores persisted active extensions before the HTTP server starts accepting
 * requests. Hosts without an extension package root deliberately remain a
 * normal, extension-disabled CozyVTT deployment.
 */
export async function rehydrateConfiguredExtensions(
  environment: { EXTENSION_PACKAGE_ROOT?: string } = process.env as {
    EXTENSION_PACKAGE_ROOT?: string;
  },
  runtimeFactory: typeof productionExtensionRuntime = productionExtensionRuntime,
): Promise<boolean> {
  if (!environment.EXTENSION_PACKAGE_ROOT) return false;
  try {
    await runtimeFactory().rehydrate();
    logger.info("Rehydrated active extension installations");
    return true;
  } catch (error) {
    logger.error(
      "Extension rehydration failed; extension tools are unavailable",
      {
        message: error instanceof Error ? error.message : "Unknown error",
      },
    );
    return false;
  }
}
