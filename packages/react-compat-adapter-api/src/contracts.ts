/** Package marker used to discover eXact adapters in an installed dependency graph. */
export const reactCompatAdapterMarkerPackage = '@exactjs/react-compat-adapter-api' as const;
/** Provides the canonical react compat adapter schema version value. */
export const reactCompatAdapterSchemaVersion = 1 as const;
/** Provides the canonical react compat adapter protocol version value. */
export const reactCompatAdapterProtocolVersion = '0.1.0' as const;

/** Defines the react compat replacement declaration interface contract. */
export interface ReactCompatReplacementDeclaration {
	/** Public package export subpath on the package declaring this replacement. */
	readonly subpath: '.' | `./${string}`;
	/** Named or default export to import from the public subpath. */
	readonly export: string;
}

/** Defines the react compat source declaration interface contract. */
export interface ReactCompatSourceDeclaration {
	/** Whether runtime exports not listed by the selected variant may remain on the source module. */
	readonly fallback: 'retain' | 'error';
	/** Ordered, non-overlapping implementations selected from the resolved source instance. */
	readonly variants: readonly ReactCompatSourceVariantDeclaration[];
}

/** Defines the react compat source variant declaration interface contract. */
export interface ReactCompatSourceVariantDeclaration {
	/** Supported versions of the resolved source package instance. */
	readonly version: string;
	/** Explicit source export names and their native eXact replacements. */
	readonly exports: Readonly<Record<string, ReactCompatReplacementDeclaration>>;
}

/** Defines the react compat adapter declaration interface contract. */
export interface ReactCompatAdapterDeclaration {
	readonly schemaVersion: typeof reactCompatAdapterSchemaVersion;
	readonly substitutions: Readonly<Record<string, ReactCompatSourceDeclaration>>;
}

/** Defines the react compat application policy interface contract. */
export interface ReactCompatApplicationPolicy {
	readonly ignoreAdapters?: readonly string[];
}

/** Defines the package manifest like interface contract. */
export interface PackageManifestLike {
	readonly name?: unknown;
	readonly version?: unknown;
	readonly dependencies?: unknown;
	readonly peerDependencies?: unknown;
	readonly optionalDependencies?: unknown;
	readonly exports?: unknown;
	readonly exact?: unknown;
}

/** Reads the inert adapter declaration from package.json without executing package code. */
