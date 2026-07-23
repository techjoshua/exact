import type { ExactJsonValue, ExactPluginConfigController } from '@exactjs/plugin-api';
import type { ExactMicrofrontendConfig } from './config.js';

/** JSON-safe microfrontend build projection consumed by bundler adapters. */
export type ExactMicrofrontendCompilerConfig = {
	exposes: readonly (readonly [string, { readonly component: string }])[];
	providedPackages: readonly string[];
	remoteBindings: readonly (
		| readonly [string, { readonly clientEntry: string }]
		| readonly [string, { readonly clientEntry: string; readonly clientEntryResolver: string }]
	)[];
};

/** Packages whose identity must be shared by every eXact remote client. */
export const mandatoryExactProvidedPackages = Object.freeze([
	'@exactjs/core',
	'@exactjs/dom',
	'@exactjs/hydrate',
	'@exactjs/reactive',
	'@exactjs/jsx/jsx-runtime'
] as const);

const controller: ExactPluginConfigController<ExactMicrofrontendConfig> = {
	defaults() {
		return { exposes: {}, remotes: {}, providedPackages: [] };
	},
	structuralValidate: validateConfig,
	validate: validateConfig,
	compilerConfig(config) {
		return {
			cacheKey: {
				exposes: sortedEntries(config.exposes),
				providedPackages: allProvidedPackageKeys(config.providedPackages),
				remoteBindings: Object.entries(config.remotes)
					.sort(([left], [right]) => left.localeCompare(right))
					.map(([binding, remote]) => [
						binding,
						{
							clientEntry: remote.clientEntry,
							...(remote.clientEntryResolver
								? { clientEntryResolver: remote.clientEntryResolver }
								: {})
						}
					])
			}
		};
	},
	serverConfig(config) {
		return Object.freeze({
			bindings: Object.freeze(
				Object.fromEntries(
					Object.entries(config.remotes).map(([binding, remote]) => [
						binding,
						Object.freeze({ endpoint: remote.endpoint })
					])
				)
			)
		});
	},
	clientConfig(config) {
		return Object.freeze({
			bindings: Object.freeze(
				Object.fromEntries(
					Object.entries(config.remotes).map(([binding, remote]) => [
						binding,
						Object.freeze({
							clientEntry: remote.clientEntry,
							...(remote.clientEntryResolver
								? { clientEntryResolver: remote.clientEntryResolver }
								: {})
						})
					])
				)
			)
		});
	}
};

export default controller;

/** Returns the deduplicated exact import keys published by a page build. */
export function allProvidedPackageKeys(configured: readonly string[]): string[] {
	return [...new Set([...mandatoryExactProvidedPackages, ...configured])].sort();
}

/** Validates and reconstructs the compiler's JSON-safe build projection. */
export function readExactMicrofrontendCompilerConfig(
	value: ExactJsonValue
): ExactMicrofrontendCompilerConfig {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Invalid microfrontends compiler configuration');
	const exposes = value.exposes;
	const providedPackages = value.providedPackages;
	const remoteBindings = value.remoteBindings;
	if (
		!Array.isArray(exposes) ||
		!exposes.every(isCompilerExposure) ||
		!Array.isArray(providedPackages) ||
		!providedPackages.every(nonempty) ||
		!Array.isArray(remoteBindings) ||
		!remoteBindings.every(isCompilerRemoteBinding)
	)
		throw new Error('Invalid microfrontends compiler configuration');
	return Object.freeze({
		exposes: Object.freeze(
			exposes.map((entry) =>
				Object.freeze([
					entry[0] as string,
					Object.freeze({ component: (entry[1] as { component: string }).component })
				] as const)
			)
		),
		providedPackages: Object.freeze([...providedPackages] as string[]),
		remoteBindings: Object.freeze(
			remoteBindings.map((entry) =>
				Object.freeze([
					entry[0],
					Object.freeze({
						clientEntry: entry[1].clientEntry,
						...(entry[1].clientEntryResolver
							? { clientEntryResolver: entry[1].clientEntryResolver }
							: {})
					})
				] as const)
			)
		)
	});
}

function isCompilerExposure(value: ExactJsonValue): value is [string, { component: string }] {
	if (!Array.isArray(value) || value.length !== 2 || !nonempty(value[0])) return false;
	const exposure = value[1];
	return (
		exposure !== null &&
		typeof exposure === 'object' &&
		!Array.isArray(exposure) &&
		nonempty(exposure.component)
	);
}

function isCompilerRemoteBinding(
	value: ExactJsonValue
): value is [string, { clientEntry: string; clientEntryResolver?: string }] {
	if (!Array.isArray(value) || value.length !== 2 || !nonempty(value[0])) return false;
	const binding = value[1];
	return (
		binding !== null &&
		typeof binding === 'object' &&
		!Array.isArray(binding) &&
		nonempty(binding.clientEntry) &&
		(binding.clientEntryResolver === undefined || nonempty(binding.clientEntryResolver))
	);
}

function validateConfig(config: ExactMicrofrontendConfig): undefined {
	if (!config || typeof config !== 'object') throw new Error('Invalid microfrontends config');
	validateRecord(config.exposes, 'exposes');
	for (const [name, exposure] of Object.entries(config.exposes)) {
		validateName(name, 'exposure');
		if (!exposure || typeof exposure !== 'object' || !nonempty(exposure.component))
			throw new Error(`Invalid microfrontend exposure ${JSON.stringify(name)}`);
	}
	validateRecord(config.remotes, 'remotes');
	for (const [name, remote] of Object.entries(config.remotes)) {
		validateName(name, 'remote binding');
		if (
			!remote ||
			typeof remote !== 'object' ||
			!nonempty(remote.endpoint) ||
			!nonempty(remote.clientEntry) ||
			(remote.clientEntryResolver !== undefined && !nonempty(remote.clientEntryResolver))
		)
			throw new Error(`Invalid microfrontend remote binding ${JSON.stringify(name)}`);
	}
	if (!Array.isArray(config.providedPackages) || !config.providedPackages.every(nonempty))
		throw new Error('Invalid microfrontend providedPackages');
	const duplicate = config.providedPackages.find(
		(value, index) => config.providedPackages.indexOf(value) !== index
	);
	if (duplicate) throw new Error(`Provided package ${JSON.stringify(duplicate)} is listed twice`);
	return undefined;
}

function sortedEntries(record: Record<string, ExactRemoteExposureConfig>): ExactJsonValue[] {
	return Object.entries(record)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, value]) => [key, { component: value.component }]);
}

function validateRecord(value: unknown, field: string): void {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error(`Invalid microfrontends ${field}`);
}

function validateName(value: string, kind: string): void {
	if (!nonempty(value)) throw new Error(`Invalid microfrontend ${kind} name`);
}

function nonempty(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

type ExactRemoteExposureConfig = ExactMicrofrontendConfig['exposes'][string];
