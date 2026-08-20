import type { ExtensionHostVersion, ExtensionManifest } from './contracts';
import { satisfiesVersion } from './versioning';

export interface CompatibilityResult {
  compatible: boolean;
  reasons: string[];
}

export function validateExtensionCompatibility(
  manifest: ExtensionManifest,
  host: ExtensionHostVersion
): CompatibilityResult {
  const reasons: string[] = [];
  if (!satisfiesVersion(host.extensionApiVersion, manifest.compatibility.extensionApi)) {
    reasons.push(
      `Extension API ${host.extensionApiVersion} does not satisfy ${manifest.compatibility.extensionApi}`
    );
  }
  if (!satisfiesVersion(host.platformVersion, manifest.compatibility.cozyVtt)) {
    reasons.push(`CozyVTT ${host.platformVersion} does not satisfy ${manifest.compatibility.cozyVtt}`);
  }
  return { compatible: reasons.length === 0, reasons };
}
