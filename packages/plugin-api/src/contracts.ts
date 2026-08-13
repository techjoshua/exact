/** Provides the canonical exact plugin api package value. */
export const exactPluginApiPackage = '@exactjs/plugin-api' as const;
/** Provides the canonical exact plugin schema version value. */
export const exactPluginSchemaVersion = 1 as const;
/** Provides the canonical exact plugin forwarding schema version value. */
export const exactPluginForwardingSchemaVersion = 1 as const;
/** Provides the canonical exact plugin protocol version value. */
export const exactPluginProtocolVersion = '1.0.0' as const;

/** Defines the exact plugin host mode type contract. */
export type ExactPluginHostMode = 'build' | 'server' | 'render' | 'client' | 'testing';

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

/** Carries the context required by exact output. */
export interface ExactOutputContext {
	readonly kind:
		| 'vnode'
		| 'html'
		| 'hydration'
		| 'client-boundary'
		| 'invocation-request'
		| 'invocation-response'
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
	buildConfig?(config: T, context: ExactPluginConfigContext): unknown | Promise<unknown>;
	serverConfig?(config: T, context: ExactPluginConfigContext): unknown | Promise<unknown>;
	renderConfig?(config: T, context: ExactPluginConfigContext): unknown | Promise<unknown>;
	clientConfig?(config: T, context: ExactPluginConfigContext): unknown | Promise<unknown>;
	testingConfig?(config: T, context: ExactPluginConfigContext): unknown | Promise<unknown>;
	/** Produces a finite, secret-free configuration projection for the plugin's language provider. */
	languageConfig?(config: T, context: ExactPluginConfigContext): unknown | Promise<unknown>;
}

/** Defines the exact plugin entries interface contract. */
export interface ExactPluginEntries {
	readonly config?: string;
	readonly configTypes?: string;
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
