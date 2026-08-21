import {
  EXTENSION_API_VERSION as sdkVersion,
  type CoreExtensionGateway as SdkGateway,
  type ExtensionModule as SdkModule,
} from "../src";
import {
  EXTENSION_API_VERSION as hostVersion,
  type CoreExtensionGateway as HostGateway,
  type ExtensionModule as HostModule,
} from "../../../backend/src/extensions/contracts";

const sdkToHostModule = (value: SdkModule): HostModule => value;
const hostToSdkModule = (value: HostModule): SdkModule => value;
const sdkToHostGateway = (value: SdkGateway): HostGateway => value;
const hostToSdkGateway = (value: HostGateway): SdkGateway => value;

void [
  sdkVersion satisfies typeof hostVersion,
  hostVersion satisfies typeof sdkVersion,
  sdkToHostModule,
  hostToSdkModule,
  sdkToHostGateway,
  hostToSdkGateway,
];
