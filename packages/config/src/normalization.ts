import type { ExactConfig } from './contracts.js';

/** Validates and freezes one application configuration at its shared ownership boundary. */
export function normalizeExactConfig<T extends ExactConfig>(value: T, label = 'eXact config'): T {
	const config = record(value, label);
	keys(
		config,
		['pluginDiscovery', 'componentLibraries', 'languageExtensions', 'debug', 'plugins'],
		label
	);
	if (config.pluginDiscovery !== undefined)
		validatePluginDiscovery(record(config.pluginDiscovery, `${label}.pluginDiscovery`), label);
	if (config.componentLibraries !== undefined)
		validateComponentLibraries(
			record(config.componentLibraries, `${label}.componentLibraries`),
			label
		);
	if (config.languageExtensions !== undefined)
		validateLanguageExtensions(
			record(config.languageExtensions, `${label}.languageExtensions`),
			label
		);
	if (config.debug !== undefined) validateDebug(record(config.debug, `${label}.debug`), label);
	if (config.plugins !== undefined)
		validatePlugins(record(config.plugins, `${label}.plugins`), label);
	return deepFreeze(value);
}

function validatePluginDiscovery(config: Record<string, unknown>, root: string): void {
	const label = `${root}.pluginDiscovery`;
	keys(
		config,
		['mode', 'ignore', 'trustedPackages', 'trustedPrefixes', 'includeDefaultTrustedPrefixes'],
		label
	);
	oneOf(config.mode, ['root', 'trusted', 'all'], `${label}.mode`, true);
	strings(config.ignore, `${label}.ignore`);
	strings(config.trustedPackages, `${label}.trustedPackages`);
	strings(config.trustedPrefixes, `${label}.trustedPrefixes`);
	boolean(config.includeDefaultTrustedPrefixes, `${label}.includeDefaultTrustedPrefixes`);
	if (config.mode !== 'trusted') {
		for (const field of ['trustedPackages', 'trustedPrefixes', 'includeDefaultTrustedPrefixes'])
			if (config[field] !== undefined)
				throw new Error(`${label}.${field} requires plugin discovery mode "trusted"`);
	}
}

function validateComponentLibraries(config: Record<string, unknown>, root: string): void {
	const label = `${root}.componentLibraries`;
	keys(
		config,
		[
			'mode',
			'allow',
			'deny',
			'trustedScopes',
			'includeDefaultTrustedScopes',
			'unauthorizedOptionalEnhancements'
		],
		label
	);
	oneOf(config.mode, ['root', 'trusted', 'all'], `${label}.mode`, true);
	packageRules(config.allow, `${label}.allow`);
	packageRules(config.deny, `${label}.deny`);
	strings(config.trustedScopes, `${label}.trustedScopes`);
	boolean(config.includeDefaultTrustedScopes, `${label}.includeDefaultTrustedScopes`);
	oneOf(
		config.unauthorizedOptionalEnhancements,
		['error', 'exclude'],
		`${label}.unauthorizedOptionalEnhancements`,
		true
	);
}

function validateLanguageExtensions(config: Record<string, unknown>, root: string): void {
	const label = `${root}.languageExtensions`;
	keys(config, ['analyzers', 'ignore', 'providers', 'diagnostics'], label);
	if (config.analyzers !== undefined) {
		const analyzers = record(config.analyzers, `${label}.analyzers`);
		keys(
			analyzers,
			['mode', 'allow', 'deny', 'trustedScopes', 'includeDefaultTrustedScopes'],
			`${label}.analyzers`
		);
		oneOf(analyzers.mode, ['off', 'root', 'trusted', 'all'], `${label}.analyzers.mode`, true);
		packageRules(analyzers.allow, `${label}.analyzers.allow`);
		packageRules(analyzers.deny, `${label}.analyzers.deny`);
		strings(analyzers.trustedScopes, `${label}.analyzers.trustedScopes`);
		boolean(
			analyzers.includeDefaultTrustedScopes,
			`${label}.analyzers.includeDefaultTrustedScopes`
		);
	}
	if (config.ignore !== undefined) {
		const entries = array(config.ignore, `${label}.ignore`);
		for (let index = 0; index < entries.length; index++) {
			const entryLabel = `${label}.ignore[${index}]`;
			const entry = record(entries[index], entryLabel);
			keys(entry, ['package', 'version', 'integrity', 'provider', 'roles'], entryLabel);
			if ((typeof entry.package === 'string') === (typeof entry.provider === 'string'))
				throw new Error(`${entryLabel} must select exactly one package or provider`);
			optionalString(entry.version, `${entryLabel}.version`);
			optionalString(entry.integrity, `${entryLabel}.integrity`);
			const roles = array(entry.roles, `${entryLabel}.roles`);
			for (let role = 0; role < roles.length; role++)
				oneOf(
					roles[role],
					[
						'declarative',
						'analyzer',
						'diagnostics',
						'completions',
						'hover',
						'inlayHints',
						'codeActions'
					],
					`${entryLabel}.roles[${role}]`
				);
		}
	}
	if (config.providers !== undefined) record(config.providers, `${label}.providers`);
	if (config.diagnostics !== undefined) {
		const diagnostics = record(config.diagnostics, `${label}.diagnostics`);
		keys(diagnostics, ['providerFailures', 'ignore', 'severity'], `${label}.diagnostics`);
		oneOf(
			diagnostics.providerFailures,
			['error', 'warning'],
			`${label}.diagnostics.providerFailures`,
			true
		);
		selectors(diagnostics.ignore, `${label}.diagnostics.ignore`, false);
		selectors(diagnostics.severity, `${label}.diagnostics.severity`, true);
	}
}

function validateDebug(config: Record<string, unknown>, root: string): void {
	const label = `${root}.debug`;
	keys(
		config,
		[
			'catalog',
			'runtime',
			'buildKey',
			'executionRoot',
			'rootComponentId',
			'producer',
			'redactions'
		],
		label
	);
	for (const field of ['catalog', 'runtime'])
		if (
			config[field] !== undefined &&
			config[field] !== true &&
			config[field] !== false &&
			config[field] !== 'auto'
		)
			throw new Error(`${label}.${field} must be a boolean or "auto"`);
	for (const field of ['buildKey', 'executionRoot', 'rootComponentId'])
		optionalString(config[field], `${label}.${field}`);
	if (config.producer !== undefined) {
		const producer = record(config.producer, `${label}.producer`);
		keys(producer, ['packageName', 'version'], `${label}.producer`);
		optionalString(producer.packageName, `${label}.producer.packageName`);
		optionalString(producer.version, `${label}.producer.version`);
	}
	if (config.redactions !== undefined) record(config.redactions, `${label}.redactions`);
}

function validatePlugins(config: Record<string, unknown>, root: string): void {
	for (const [name, transform] of Object.entries(config))
		if (transform !== false && typeof transform !== 'function')
			throw new Error(`${root}.plugins.${name} must be a configuration function or false`);
}

function packageRules(value: unknown, label: string): void {
	if (value === undefined) return;
	const entries = array(value, label);
	for (let index = 0; index < entries.length; index++) {
		const entry = entries[index];
		if (typeof entry === 'string') continue;
		const entryLabel = `${label}[${index}]`;
		const rule = record(entry, entryLabel);
		keys(rule, ['package', 'version', 'integrity'], entryLabel);
		requiredString(rule.package, `${entryLabel}.package`);
		optionalString(rule.version, `${entryLabel}.version`);
		optionalString(rule.integrity, `${entryLabel}.integrity`);
	}
}

function selectors(value: unknown, label: string, severity: boolean): void {
	if (value === undefined) return;
	const entries = array(value, label);
	for (let index = 0; index < entries.length; index++) {
		const entryLabel = `${label}[${index}]`;
		const entry = record(entries[index], entryLabel);
		keys(
			entry,
			severity ? ['provider', 'codes', 'paths', 'severity'] : ['provider', 'codes', 'paths'],
			entryLabel
		);
		requiredString(entry.provider, `${entryLabel}.provider`);
		strings(entry.codes, `${entryLabel}.codes`, true);
		strings(entry.paths, `${entryLabel}.paths`);
		if (severity)
			oneOf(entry.severity, ['error', 'warning', 'info', 'hint', 'off'], `${entryLabel}.severity`);
	}
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error(`${label} must be an object`);
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null)
		throw new Error(`${label} must be a plain object`);
	return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
	for (const key of Object.keys(value))
		if (!allowed.includes(key))
			throw new Error(`${label} contains unknown option ${JSON.stringify(key)}`);
}

function array(value: unknown, label: string): readonly unknown[] {
	if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
	return value;
}

function strings(value: unknown, label: string, required = false): void {
	if (value === undefined && !required) return;
	const values = array(value, label);
	for (let index = 0; index < values.length; index++)
		requiredString(values[index], `${label}[${index}]`);
}

function requiredString(value: unknown, label: string): void {
	if (typeof value !== 'string' || !value.length)
		throw new Error(`${label} must be a non-empty string`);
}

function optionalString(value: unknown, label: string): void {
	if (value !== undefined) requiredString(value, label);
}

function boolean(value: unknown, label: string): void {
	if (value !== undefined && typeof value !== 'boolean')
		throw new Error(`${label} must be a boolean`);
}

function oneOf(value: unknown, allowed: readonly string[], label: string, optional = false): void {
	if (value === undefined && optional) return;
	if (typeof value !== 'string' || !allowed.includes(value))
		throw new Error(
			`${label} must be one of ${allowed.map((entry) => JSON.stringify(entry)).join(', ')}`
		);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
	if (
		!value ||
		(typeof value !== 'object' && typeof value !== 'function') ||
		seen.has(value as object)
	)
		return value;
	seen.add(value as object);
	for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
	return Object.freeze(value);
}
