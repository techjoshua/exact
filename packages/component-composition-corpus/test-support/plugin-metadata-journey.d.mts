/** Checks ordinary metadata observations and independent normalized policy values. */
export function verifyPluginMetadataValues(api: {
	readExactPackageParticipation: typeof import('../../plugin-api/src/manifest.js').readExactPackageParticipation;
	resolveDiscoveryPolicy: typeof import('../../plugin-host/src/discovery/policy.js').resolveDiscoveryPolicy;
}): true;

/** Checks captured forwarding booleans, selector validation and trust-prefix publication. */
export function verifyPluginMetadataCapture(api: {
	readExactPackageParticipation: typeof import('../../plugin-api/src/manifest.js').readExactPackageParticipation;
	resolveDiscoveryPolicy: typeof import('../../plugin-host/src/discovery/policy.js').resolveDiscoveryPolicy;
}): true;
