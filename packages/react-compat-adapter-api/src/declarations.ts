import {
	assertExportName,
	assertOnlyKeys,
	assertPackageName,
	assertPublicSubpath,
	assertSourceModule,
	dependencyRange,
	optionalRecord,
	requiredRecord,
	requiredString
} from './validation.js';
import {
	reactCompatAdapterMarkerPackage,
	reactCompatAdapterSchemaVersion,
	type PackageManifestLike,
	type ReactCompatAdapterDeclaration,
	type ReactCompatApplicationPolicy,
	type ReactCompatReplacementDeclaration,
	type ReactCompatSourceDeclaration
} from './contracts.js';

/** Reads an inert adapter declaration from package metadata without executing package code. */
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

/** Performs the package directly depends on adapter marker domain operation. */
export function packageDirectlyDependsOnAdapterMarker(manifest: PackageManifestLike): boolean {
	return (
		dependencyRange(manifest.dependencies, reactCompatAdapterMarkerPackage) !== undefined ||
		dependencyRange(manifest.optionalDependencies, reactCompatAdapterMarkerPackage) !== undefined
	);
}

function packageLabel(manifest: PackageManifestLike): string {
	return typeof manifest.name === 'string' && manifest.name ? manifest.name : 'package.json';
}
