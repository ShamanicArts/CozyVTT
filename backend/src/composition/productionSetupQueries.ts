import { SetupQueries } from "../application/identity/Setup";
import { productionSystemSettings } from "./productionPublicSettingsQueries";

export const productionSetupQueries = new SetupQueries(
  productionSystemSettings,
);
