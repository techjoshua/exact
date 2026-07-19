/** Provides the canonical exact plugin api package value. */
export const exactPluginApiPackage = '@exact/plugin-api' as const;
/** Provides the canonical exact plugin schema version value. */
export const exactPluginSchemaVersion = 1 as const;
/** Provides the canonical exact plugin forwarding schema version value. */
export const exactPluginForwardingSchemaVersion = 1 as const;
/** Provides the canonical exact plugin protocol version value. */
export const exactPluginProtocolVersion = '1.0.0' as const;

/** Defines the exact plugin host mode type contract. */
export type ExactPluginHostMode = 'compiler' | 'server' | 'render' | 'client' | 'testing';

/** Defines the exact json value type contract. */
export type ExactJsonValue =
	| null
	| boolean
	| number
	| string
	| ExactJsonValue[]
	| { [key: string]: ExactJsonValue };

/** Defines the exact plugin provenance interface contract. */
export interface ExactPluginProvenance {
	readonly activationPaths: readonly (readonly string[])[];
	readonly orderingAfter: readonly string[];
}

/** Carries the context required by exact plugin config. */
export interface ExactPluginConfigContext {
	readonly plugin: {
		readonly packageName: string;
		readonly version: string;
	};
	readonly contributor: {
		readonly packageName: string;
		readonly version: string;
	};
	readonly applicationRoot: string;
	readonly environment: string;
	readonly hostMode: ExactPluginHostMode;
	readonly signal: AbortSignal;
	readonly executionIndex: number;
	readonly provenance: ExactPluginProvenance;
}

/** Defines the exact plugin config transform type contract. */
export type ExactPluginConfigTransform<T> = (
	config: T,
	context: ExactPluginConfigContext
) => T | undefined | Promise<T | undefined>;

/** Defines the exact compiler diagnostic interface contract. */
export interface ExactCompilerDiagnostic {
	readonly severity: 'info' | 'warning' | 'error';
	readonly code: string;
	readonly message: string;
	readonly start?: number;
	readonly length?: number;
}

/** Defines the exact compiler module view interface contract. */
export interface ExactCompilerModuleView {
	readonly id: string;
	readonly source: string;
	readonly target: 'default' | 'client' | 'server';
	readonly directives: readonly ExactCompilerDirective[];
}

/** Defines the exact compiler directive interface contract. */
export interface ExactCompilerDirective {
	readonly namespace: string;
	readonly name: string;
	readonly argument?: string;
	readonly start: number;
	readonly length: number;
}

/** Defines the exact compiler module contribution interface contract. */
export interface ExactCompilerModuleContribution {
	readonly diagnostics?: readonly ExactCompilerDiagnostic[];
	readonly manifestData?: ExactJsonValue;
}

/** Defines the exact compiler plugin extension interface contract. */
export interface ExactCompilerPluginExtension {
	readonly namespace: string;
	readonly directives?: readonly string[];
	readonly include?: RegExp;
	analyzeModule?(view: ExactCompilerModuleView): ExactCompilerModuleContribution | undefined;
	validateManifestData?(value: ExactJsonValue): undefined;
}

/** Configures exact compiler plugin. */
export interface ExactCompilerPluginConfig {
	readonly cacheKey: ExactJsonValue;
	readonly extension?: ExactCompilerPluginExtension;
}

/** Defines the exact prepared compiler plugin interface contract. */
export interface ExactPreparedCompilerPlugin {
	readonly packageName: string;
	readonly version: string;
	readonly protocolVersion: string;
	readonly required: boolean;
	readonly cacheKey: ExactJsonValue;
	readonly extension?: ExactCompilerPluginExtension;
}

/** Defines the exact prepared compiler registry interface contract. */
export interface ExactPreparedCompilerRegistry {
	readonly fingerprint: string;
	readonly plugins: Readonly<Record<string, ExactPreparedCompilerPlugin>>;
}

/** Carries the context required by exact output. */
export interface ExactOutputContext {
	readonly kind:
		| 'vnode'
		| 'html'
		| 'hydration'
		| 'client-boundary'
		| 'action-request'
		| 'action-response'
		| 'refresh-request'
		| 'refresh-response'
		| 'patch'
		| 'stream'
		| 'log'
		| 'error';
	readonly signal?: AbortSignal;
}

/** Defines the exact output extension interface contract. */
export interface ExactOutputExtension<T = unknown> {
	transform?(value: T, context: ExactOutputContext): T | Promise<T>;
	validate?(value: T, context: ExactOutputContext): undefined | Promise<undefined>;
}

/** Carries the context required by exact plugin lifecycle. */
export interface ExactPluginLifecycleContext {
	readonly applicationRoot: string;
	readonly environment: string;
	readonly signal: AbortSignal;
}

/** Defines the exact plugin resource interface contract. */
export interface ExactPluginResource {
	dispose(): void | Promise<void>;
}

/** Defines the exact runtime plugin extension interface contract. */
export interface ExactRuntimePluginExtension {
	validate?(): undefined | Promise<undefined>;
	initializeApplication?(
		context: ExactPluginLifecycleContext
	): ExactPluginResource | void | Promise<ExactPluginResource | void>;
	initializeRequest?(
		context: ExactPluginLifecycleContext
	): ExactPluginResource | void | Promise<ExactPluginResource | void>;
	output?: ExactOutputExtension;
}

/** Defines the exact plugin config controller interface contract. */
export interface ExactPluginConfigController<T> {
	defaults(context: ExactPluginConfigContext): T | Promise<T>;
	structuralValidate?(config: T, context: ExactPluginConfigContext): undefined;
	validate(config: T, context: ExactPluginConfigContext): undefined | Promise<undefined>;
	compilerConfig?(
		config: T,
		context: ExactPluginConfigContext
	): ExactCompilerPluginConfig | Promise<ExactCompilerPluginConfig>;
	serverConfig?(config: T, context: ExactPluginConfigContext): unknown | Promise<unknown>;
	renderConfig?(config: T, context: ExactPluginConfigContext): unknown | Promise<unknown>;
	clientConfig?(config: T, context: ExactPluginConfigContext): unknown | Promise<unknown>;
	testingConfig?(config: T, context: ExactPluginConfigContext): unknown | Promise<unknown>;
}

/** Defines the exact plugin entries interface contract. */
export interface ExactPluginEntries {
	readonly config?: string;
	readonly configTypes?: string;
	readonly compiler?: string;
	readonly server?: string;
	readonly render?: string;
	readonly client?: string;
	readonly testing?: string;
}

/** Defines the exact plugin declaration interface contract. */
export interface ExactPluginDeclaration {
	readonly schemaVersion: typeof exactPluginSchemaVersion;
	readonly protocolVersion: string;
	readonly configKey: string;
	readonly entries: ExactPluginEntries;
}

/** Defines the exact plugin forward declaration interface contract. */
export interface ExactPluginForwardDeclaration {
	readonly required?: boolean;
}

/** Defines the exact plugin forwarding declaration interface contract. */
export interface ExactPluginForwardingDeclaration {
	readonly schemaVersion: typeof exactPluginForwardingSchemaVersion;
	readonly include: Readonly<Record<string, ExactPluginForwardDeclaration>>;
	readonly ignore?: readonly string[];
}

/** Defines the exact plugin configuration declaration interface contract. */
export interface ExactPluginConfigurationDeclaration {
	readonly version?: string;
	readonly subpath: string;
	readonly export: string;
}

/** Defines the exact package manifest interface contract. */
export interface ExactPackageManifest {
	readonly name?: unknown;
	readonly version?: unknown;
	readonly dependencies?: unknown;
	readonly optionalDependencies?: unknown;
	readonly peerDependencies?: unknown;
	readonly exports?: unknown;
	readonly exact?: unknown;
}

/** Defines the exact package participation interface contract. */
export interface ExactPackageParticipation {
	readonly plugin?: ExactPluginDeclaration;
	readonly forwarding?: ExactPluginForwardingDeclaration;
	readonly configuration: Readonly<Record<string, ExactPluginConfigurationDeclaration>>;
}

/** Reads an exact package participation from its source representation. */
export function readExactPackageParticipation(
	manifest: ExactPackageManifest,
	label = packageLabel(manifest)
): ExactPackageParticipation {
	const exact = optionalRecord(manifest.exact, `${label}.exact`);
	if (!exact) return Object.freeze({ configuration: Object.freeze({}) });
	const plugin = readPlugin(exact.plugin, label);
	const forwarding = readForwarding(exact.pluginForwarding, label);
	const configuration = readConfiguration(exact.pluginConfiguration, label);
	return Object.freeze({ plugin, forwarding, configuration });
}

/** Performs the package directly depends on plugin api domain operation. */
export function packageDirectlyDependsOnPluginApi(manifest: ExactPackageManifest): boolean {
	return (
		dependencyRange(manifest.dependencies, exactPluginApiPackage) !== undefined ||
		dependencyRange(manifest.optionalDependencies, exactPluginApiPackage) !== undefined
	);
}

/** Performs the dependency range domain operation. */
export function dependencyRange(value: unknown, packageName: string): string | undefined {
	if (!isRecord(value)) return undefined;
	const range = value[packageName];
	return typeof range === 'string' && range.length ? range : undefined;
}

/** Validates package selector and throws when the contract is violated. */
export function assertPackageSelector(value: string, label: string): void {
	if (value.endsWith('/')) {
		const base = value.slice(0, -1);
		if (!/^@[a-z0-9][a-z0-9._~-]*$/i.test(base)) {
			throw new Error(`${label} must be a package name or scoped prefix ending in /`);
		}
		return;
	}
	assertPackageName(value, label);
}

/** Validates public package subpath and throws when the contract is violated. */
export function assertPublicPackageSubpath(value: string, label: string): void {
	if (value === '.') return;
	if (
		!value.startsWith('./') ||
		value.length === 2 ||
		value.includes('\\') ||
		value.split('/').includes('..') ||
		/[?#]/.test(value)
	) {
		throw new Error(`${label} must be a public package export subpath`);
	}
}

function readPlugin(value: unknown, label: string): ExactPluginDeclaration | undefined {
	const record = optionalRecord(value, `${label}.exact.plugin`);
	if (!record) return undefined;
	assertOnlyKeys(
		record,
		['schemaVersion', 'protocolVersion', 'configKey', 'entries'],
		`${label}.exact.plugin`
	);
	if (record.schemaVersion !== exactPluginSchemaVersion) {
		throw new Error(`${label}.exact.plugin.schemaVersion must be ${exactPluginSchemaVersion}`);
	}
	const protocolVersion = requiredString(
		record.protocolVersion,
		`${label}.exact.plugin.protocolVersion`
	);
	const configKey = requiredString(record.configKey, `${label}.exact.plugin.configKey`);
	if (!/^[$A-Z_a-z][$\w]*$/.test(configKey))
		throw new Error(`${label}.exact.plugin.configKey must be an identifier`);
	const entriesRecord = requiredRecord(record.entries, `${label}.exact.plugin.entries`);
	assertOnlyKeys(
		entriesRecord,
		['config', 'configTypes', 'compiler', 'server', 'render', 'client', 'testing'],
		`${label}.exact.plugin.entries`
	);
	const entries: Record<string, string> = {};
	for (const [key, raw] of Object.entries(entriesRecord)) {
		const subpath = requiredString(raw, `${label}.exact.plugin.entries.${key}`);
		assertPublicPackageSubpath(subpath, `${label}.exact.plugin.entries.${key}`);
		entries[key] = subpath;
	}
	return Object.freeze({
		schemaVersion: exactPluginSchemaVersion,
		protocolVersion,
		configKey,
		entries: Object.freeze(entries)
	});
}

function readForwarding(
	value: unknown,
	label: string
): ExactPluginForwardingDeclaration | undefined {
	const record = optionalRecord(value, `${label}.exact.pluginForwarding`);
	if (!record) return undefined;
	assertOnlyKeys(record, ['schemaVersion', 'include', 'ignore'], `${label}.exact.pluginForwarding`);
	if (record.schemaVersion !== exactPluginForwardingSchemaVersion) {
		throw new Error(
			`${label}.exact.pluginForwarding.schemaVersion must be ${exactPluginForwardingSchemaVersion}`
		);
	}
	const includeRecord = requiredRecord(record.include, `${label}.exact.pluginForwarding.include`);
	const include: Record<string, ExactPluginForwardDeclaration> = {};
	for (const [name, raw] of Object.entries(includeRecord)) {
		assertPackageName(name, `${label} forwarded package`);
		const declaration = requiredRecord(raw, `${label} forwarding declaration for ${name}`);
		assertOnlyKeys(declaration, ['required'], `${label} forwarding declaration for ${name}`);
		if (declaration.required !== undefined && typeof declaration.required !== 'boolean') {
			throw new Error(`${label} forwarding declaration for ${name}.required must be boolean`);
		}
		include[name] = Object.freeze({ required: declaration.required });
	}
	const ignore = readSelectors(record.ignore, `${label}.exact.pluginForwarding.ignore`);
	for (const name of Object.keys(include)) {
		if (matchesPackageSelectors(name, ignore))
			throw new Error(`${label} cannot include and ignore ${name}`);
	}
	return Object.freeze({
		schemaVersion: exactPluginForwardingSchemaVersion,
		include: Object.freeze(include),
		ignore
	});
}

function readConfiguration(
	value: unknown,
	label: string
): Readonly<Record<string, ExactPluginConfigurationDeclaration>> {
	const record = optionalRecord(value, `${label}.exact.pluginConfiguration`);
	if (!record) return Object.freeze({});
	const result: Record<string, ExactPluginConfigurationDeclaration> = {};
	for (const [name, raw] of Object.entries(record)) {
		assertPackageName(name, `${label} configured plugin`);
		const declaration = requiredRecord(raw, `${label} configuration for ${name}`);
		assertOnlyKeys(
			declaration,
			['version', 'subpath', 'export'],
			`${label} configuration for ${name}`
		);
		const subpath = requiredString(
			declaration.subpath,
			`${label} configuration for ${name}.subpath`
		);
		assertPublicPackageSubpath(subpath, `${label} configuration for ${name}.subpath`);
		const exportName = requiredString(
			declaration.export,
			`${label} configuration for ${name}.export`
		);
		if (exportName !== 'default' && !/^[$A-Z_a-z][$\w]*$/.test(exportName)) {
			throw new Error(`${label} configuration for ${name}.export must be an export name`);
		}
		result[name] = Object.freeze({
			...(declaration.version === undefined
				? {}
				: {
						version: requiredString(
							declaration.version,
							`${label} configuration for ${name}.version`
						)
					}),
			subpath,
			export: exportName
		});
	}
	return Object.freeze(result);
}

/** Reads a selectors from its source representation. */
export function readSelectors(value: unknown, label: string): readonly string[] {
	if (value === undefined) return Object.freeze([]);
	if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
	const seen = new Set<string>();
	const result = value.map((raw, index) => {
		const selector = requiredString(raw, `${label}[${index}]`);
		assertPackageSelector(selector, `${label}[${index}]`);
		if (seen.has(selector)) throw new Error(`${label} contains duplicate selector ${selector}`);
		seen.add(selector);
		return selector;
	});
	return Object.freeze(result);
}

/** Reports whether package selectors. */
export function matchesPackageSelectors(
	packageName: string,
	selectors: readonly string[]
): boolean {
	return selectors.some((selector) =>
		selector.endsWith('/') ? packageName.startsWith(selector) : packageName === selector
	);
}

function assertPackageName(value: string, label: string): void {
	if (!/^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/i.test(value)) {
		throw new Error(`${label} must be a bare package name`);
	}
}

function packageLabel(manifest: ExactPackageManifest): string {
	return typeof manifest.name === 'string' && manifest.name ? manifest.name : 'package.json';
}

function requiredString(value: unknown, label: string): string {
	if (typeof value !== 'string' || !value.trim())
		throw new Error(`${label} must be a non-empty string`);
	return value;
}

function optionalRecord(value: unknown, label: string): Record<string, unknown> | undefined {
	if (value === undefined) return undefined;
	return requiredRecord(value, label);
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
	if (!isRecord(value)) throw new Error(`${label} must be an object`);
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(
	value: Record<string, unknown>,
	allowed: readonly string[],
	label: string
): void {
	const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
	if (unsupported.length)
		throw new Error(`${label} contains unsupported fields: ${unsupported.join(', ')}`);
}
