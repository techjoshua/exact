import type { ExactPluginDiscoveryConfig } from '@exactjs/config';
import { assertPackageSelector } from '@exactjs/plugin-api';
import type { ExactDiscoveryPolicy } from './contracts.js';

/** Resolves a discovery policy. */
export function resolveDiscoveryPolicy(
	config: ExactPluginDiscoveryConfig | undefined
): ExactDiscoveryPolicy {
	if (!config) {
		return Object.freeze({
			mode: 'trusted',
			trustedPackages: Object.freeze([]),
			trustedPrefixes: Object.freeze(['@exactjs/']),
			ignore: Object.freeze([])
		});
	}
	if (config.mode === 'all') {
		validateSelectors(config.ignore ?? [], 'pluginDiscovery.ignore');
		return Object.freeze({
			mode: 'all',
			trustedPackages: Object.freeze([]),
			trustedPrefixes: Object.freeze([]),
			ignore: Object.freeze([...(config.ignore ?? [])])
		});
	}
	if (config.mode === 'trusted') {
		validateSelectors(config.trustedPackages ?? [], 'pluginDiscovery.trustedPackages');
		for (const packageNameValue of config.trustedPackages ?? []) {
			if (packageNameValue.endsWith('/'))
				throw new Error(
					`pluginDiscovery.trustedPackages entry ${packageNameValue} must be an exact package name`
				);
		}
		validateSelectors(config.trustedPrefixes ?? [], 'pluginDiscovery.trustedPrefixes');
		for (const prefix of config.trustedPrefixes ?? []) {
			if (!prefix.endsWith('/'))
				throw new Error(`pluginDiscovery.trustedPrefixes entry ${prefix} must end in /`);
		}
		validateSelectors(config.ignore ?? [], 'pluginDiscovery.ignore');
		return Object.freeze({
			mode: 'trusted',
			trustedPackages: Object.freeze([...(config.trustedPackages ?? [])]),
			trustedPrefixes: Object.freeze([
				...(config.includeDefaultTrustedPrefixes === false ? [] : ['@exactjs/']),
				...(config.trustedPrefixes ?? [])
			]),
			ignore: Object.freeze([...(config.ignore ?? [])])
		});
	}
	validateSelectors(config.ignore ?? [], 'pluginDiscovery.ignore');
	return Object.freeze({
		mode: 'root',
		trustedPackages: Object.freeze([]),
		trustedPrefixes: Object.freeze([]),
		ignore: Object.freeze([...(config.ignore ?? [])])
	});
}

function validateSelectors(values: readonly string[], label: string): void {
	const seen = new Set<string>();
	for (const value of values) {
		assertPackageSelector(value, label);
		if (seen.has(value)) throw new Error(`${label} contains duplicate selector ${value}`);
		seen.add(value);
	}
}
