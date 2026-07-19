/** Package marker used to discover eXact adapters in an installed dependency graph. */
export const reactCompatAdapterMarkerPackage = '@exact/react-compat-adapter-api' as const;
export const reactCompatAdapterSchemaVersion = 1 as const;
export const reactCompatAdapterProtocolVersion = '1.0.0' as const;

export interface ReactCompatReplacementDeclaration {
	/** Public package export subpath on the package declaring this replacement. */
	readonly subpath: '.' | `./${string}`;
	/** Named or default export to import from the public subpath. */
	readonly export: string;
}

export interface ReactCompatSourceDeclaration {
	/** Whether runtime exports not listed by the selected variant may remain on the source module. */
	readonly fallback: 'retain' | 'error';
	/** Ordered, non-overlapping implementations selected from the resolved source instance. */
	readonly variants: readonly ReactCompatSourceVariantDeclaration[];
}

export interface ReactCompatSourceVariantDeclaration {
	/** Supported versions of the resolved source package instance. */
	readonly version: string;
	/** Explicit source export names and their native eXact replacements. */
	readonly exports: Readonly<Record<string, ReactCompatReplacementDeclaration>>;
}

export interface ReactCompatAdapterDeclaration {
	readonly schemaVersion: typeof reactCompatAdapterSchemaVersion;
	readonly substitutions: Readonly<Record<string, ReactCompatSourceDeclaration>>;
}

export interface ReactCompatApplicationPolicy {
	readonly ignoreAdapters?: readonly string[];
}

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
export function readReactCompatAdapterDeclaration(
	manifest: PackageManifestLike,
	label = packageLabel(manifest)
): ReactCompatAdapterDeclaration | undefined {
	const exact = optionalRecord(manifest.exact, `${label}.exact`);
	if (!exact) return undefined;
	const compatibility = optionalRecord(
		exact.reactCompatibility,
		`${label}.exact.reactCompatibility`
	);
	if (!compatibility) return undefined;
	if ('ignoreAdapters' in compatibility) {
		throw new Error(
			`${label} declares ignoreAdapters in adapter metadata; only the application root may ignore adapters`
		);
	}
	assertOnlyKeys(
		compatibility,
		['schemaVersion', 'substitutions'],
		`${label}.exact.reactCompatibility`
	);
	if (compatibility.schemaVersion !== reactCompatAdapterSchemaVersion) {
		throw new Error(
			`${label}.exact.reactCompatibility.schemaVersion must be ${reactCompatAdapterSchemaVersion}`
		);
	}
	const substitutions = requiredRecord(
		compatibility.substitutions,
		`${label}.exact.reactCompatibility.substitutions`
	);
	if (!Object.keys(substitutions).length)
		throw new Error(`${label} must declare at least one React compatibility substitution`);
	const parsed: Record<string, ReactCompatSourceDeclaration> = {};
	for (const [sourceModule, rawSource] of Object.entries(substitutions)) {
		assertSourceModule(sourceModule, label);
		const source = requiredRecord(rawSource, `${label} substitution ${sourceModule}`);
		assertOnlyKeys(source, ['fallback', 'variants'], `${label} substitution ${sourceModule}`);
		const fallback =
			source.fallback === undefined
				? 'retain'
				: requiredString(source.fallback, `${label} substitution ${sourceModule}.fallback`);
		if (fallback !== 'retain' && fallback !== 'error') {
			throw new Error(`${label} substitution ${sourceModule}.fallback must be "retain" or "error"`);
		}
		if (!Array.isArray(source.variants) || !source.variants.length) {
			throw new Error(`${label} substitution ${sourceModule}.variants must be a non-empty array`);
		}
		const variants = source.variants.map((rawVariant, variantIndex) => {
			const variantLabel = `${label} substitution ${sourceModule}.variants[${variantIndex}]`;
			const variant = requiredRecord(rawVariant, variantLabel);
			assertOnlyKeys(variant, ['version', 'exports'], variantLabel);
			const version = requiredString(variant.version, `${variantLabel}.version`);
			const exports = requiredRecord(variant.exports, `${variantLabel}.exports`);
			if (!Object.keys(exports).length)
				throw new Error(`${variantLabel} must declare at least one export`);
			const parsedExports: Record<string, ReactCompatReplacementDeclaration> = {};
			for (const [sourceExport, rawReplacement] of Object.entries(exports)) {
				assertExportName(sourceExport, `${label} source export`);
				const replacement = requiredRecord(
					rawReplacement,
					`${variantLabel} replacement for ${sourceModule}.${sourceExport}`
				);
				assertOnlyKeys(
					replacement,
					['subpath', 'export'],
					`${variantLabel} replacement for ${sourceModule}.${sourceExport}`
				);
				const subpath = requiredString(replacement.subpath, `${variantLabel} replacement subpath`);
				assertPublicSubpath(subpath, label);
				const exportName = requiredString(replacement.export, `${variantLabel} replacement export`);
				assertExportName(exportName, `${variantLabel} replacement export`);
				parsedExports[sourceExport] = Object.freeze({
					subpath: subpath as ReactCompatReplacementDeclaration['subpath'],
					export: exportName
				});
			}
			return Object.freeze({ version, exports: Object.freeze(parsedExports) });
		});
		parsed[sourceModule] = Object.freeze({ fallback, variants: Object.freeze(variants) });
	}
	return Object.freeze({
		schemaVersion: reactCompatAdapterSchemaVersion,
		substitutions: Object.freeze(parsed)
	});
}

/** Reads root-only adapter suppression policy from the application package.json. */
export function readReactCompatApplicationPolicy(
	manifest: PackageManifestLike,
	label = packageLabel(manifest)
): ReactCompatApplicationPolicy {
	const exact = optionalRecord(manifest.exact, `${label}.exact`);
	if (!exact) return Object.freeze({});
	const compatibility = optionalRecord(
		exact.reactCompatibility,
		`${label}.exact.reactCompatibility`
	);
	if (!compatibility) return Object.freeze({});
	const raw = compatibility.ignoreAdapters;
	if (raw === undefined) return Object.freeze({});
	if (!Array.isArray(raw))
		throw new Error(
			`${label}.exact.reactCompatibility.ignoreAdapters must be an array of package names`
		);
	const seen = new Set<string>();
	const ignoreAdapters = raw.map((value, index) => {
		const name = requiredString(
			value,
			`${label}.exact.reactCompatibility.ignoreAdapters[${index}]`
		);
		assertPackageName(name, `${label} ignored adapter`);
		if (seen.has(name)) throw new Error(`${label} lists ignored adapter ${name} more than once`);
		seen.add(name);
		return name;
	});
	return Object.freeze({ ignoreAdapters: Object.freeze(ignoreAdapters) });
}

export function packageDirectlyDependsOnAdapterMarker(manifest: PackageManifestLike): boolean {
	return (
		dependencyRange(manifest.dependencies, reactCompatAdapterMarkerPackage) !== undefined ||
		dependencyRange(manifest.optionalDependencies, reactCompatAdapterMarkerPackage) !== undefined
	);
}

export function dependencyRange(dependencies: unknown, packageName: string): string | undefined {
	if (!isRecord(dependencies)) return undefined;
	const value = dependencies[packageName];
	return typeof value === 'string' && value.length ? value : undefined;
}

function assertSourceModule(specifier: string, label: string): void {
	const name = packageNameFromBareSpecifier(specifier);
	if (name === 'react' || name === 'react-dom' || name.startsWith('@exact/')) {
		throw new Error(`${label} cannot replace reserved framework package ${specifier}`);
	}
}

export function packageNameFromBareSpecifier(specifier: string): string {
	if (!specifier || specifier.includes('\\') || /^(?:\.|\/|[a-z][a-z+.-]*:)/i.test(specifier)) {
		throw new Error(
			`Source module must be a bare package specifier; received ${JSON.stringify(specifier)}`
		);
	}
	const segments = specifier.split('/');
	const packageSegments = specifier.startsWith('@') ? segments.slice(0, 2) : segments.slice(0, 1);
	const name = packageSegments.join('/');
	assertPackageName(name, 'Source module package');
	const subpath = segments.slice(packageSegments.length);
	if (
		subpath.some(
			(segment) => !segment || segment === '.' || segment === '..' || /[?#]/.test(segment)
		)
	) {
		throw new Error(
			`Source module must be a bare package specifier; received ${JSON.stringify(specifier)}`
		);
	}
	return name;
}

function assertPackageName(name: string, label: string): void {
	const valid = /^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/i.test(
		name
	);
	if (!valid)
		throw new Error(`${label} must be a bare package name; received ${JSON.stringify(name)}`);
}

function assertPublicSubpath(subpath: string, label: string): void {
	if (subpath === '.') return;
	if (
		!subpath.startsWith('./') ||
		subpath.length === 2 ||
		subpath.includes('\\') ||
		subpath.includes('..') ||
		/[?#]/.test(subpath)
	) {
		throw new Error(
			`${label} replacement subpath must be a public package export subpath; received ${JSON.stringify(subpath)}`
		);
	}
}

function assertExportName(name: string, label: string): void {
	if (name === 'default') return;
	if (!/^[$A-Z_a-z][$\w]*$/.test(name))
		throw new Error(
			`${label} must be an explicit JavaScript export name; received ${JSON.stringify(name)}`
		);
}

function packageLabel(manifest: PackageManifestLike): string {
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
	const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
	if (unexpected.length)
		throw new Error(
			`${label} contains unsupported ${unexpected.length === 1 ? 'field' : 'fields'}: ${unexpected.join(', ')}`
		);
}
