import type { ExactPluginDiscoveryConfig } from '@exactjs/config';
import { assertPackageSelector } from '@exactjs/plugin-api';
import type { ExactDiscoveryPolicy } from './contracts.js';

/** Captures and validates discovery choices before selecting executable package code. */
export function resolveDiscoveryPolicy(
	config: ExactPluginDiscoveryConfig | undefined
): ExactDiscoveryPolicy {
	if (!config)
		return { mode: 'trusted', trustedPackages: [], trustedPrefixes: ['@exactjs/'], ignore: [] };
	const mode = config.mode;
	const ignore = [...(config.ignore ?? [])];
	validateSelectors(ignore, 'pluginDiscovery.ignore');
	if (mode === 'trusted') {
		const trustedPackages = [...(config.trustedPackages ?? [])];
		const prefixes = [...(config.trustedPrefixes ?? [])];
		const includeDefaults = config.includeDefaultTrustedPrefixes !== false;
		validateSelectors(trustedPackages, 'pluginDiscovery.trustedPackages');
		for (const name of trustedPackages) {
			if (name.endsWith('/'))
				throw new Error(
					'pluginDiscovery.trustedPackages entry ' + name + ' must be an exact package name'
				);
		}
		validateSelectors(prefixes, 'pluginDiscovery.trustedPrefixes');
		for (const prefix of prefixes) {
			if (!prefix.endsWith('/'))
				throw new Error('pluginDiscovery.trustedPrefixes entry ' + prefix + ' must end in /');
		}
		return {
			mode,
			trustedPackages,
			trustedPrefixes: [...(includeDefaults ? ['@exactjs/'] : []), ...prefixes],
			ignore
		};
	}
	return {
		mode: mode === 'all' ? 'all' : 'root',
		trustedPackages: [],
		trustedPrefixes: [],
		ignore
	};
}

function validateSelectors(values: readonly string[], label: string): void {
	const seen = new Set<string>();
	for (const value of values) {
		assertPackageSelector(value, label);
		if (seen.has(value)) throw new Error(`${label} contains duplicate selector ${value}`);
		seen.add(value);
	}
}
