/** Provides the canonical exact plugin api package value. */
export const exactPluginApiPackage = '@exactjs/plugin-api' as const;
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
