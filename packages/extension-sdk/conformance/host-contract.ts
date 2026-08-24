import {
  EXTENSION_API_VERSION as sdkVersion,
  type CoreExtensionGateway as SdkGateway,
  type ExtensionModule as SdkModule,
  type CampaignPresentationContributionDescriptor as SdkPresentation,
} from "../src";
import {
  EXTENSION_API_VERSION as hostVersion,
  type CoreExtensionGateway as HostGateway,
  type ExtensionModule as HostModule,
} from "../../../backend/src/extensions/contracts";
import type { CampaignPresentationContribution as HostPresentation } from "../../../backend/src/extensions/host/contracts";

const sdkToHostModule = (value: SdkModule): HostModule => value;
const hostToSdkModule = (value: HostModule): SdkModule => value;
const sdkToHostGateway = (value: SdkGateway): HostGateway => value;
const hostToSdkGateway = (value: HostGateway): SdkGateway => value;
const sdkToHostPresentation = (value: SdkPresentation): HostPresentation => value;
const hostToSdkPresentation = (value: HostPresentation): SdkPresentation => value;

void [
  sdkVersion satisfies typeof hostVersion,
  hostVersion satisfies typeof sdkVersion,
  sdkToHostModule,
  hostToSdkModule,
  sdkToHostGateway,
  hostToSdkGateway,
  sdkToHostPresentation,
  hostToSdkPresentation,
];
