import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Minimum physical package evidence needed for public-export resolution. */
export interface ExactPublicPackageNode {
	readonly location: string;
	readonly realPath: string;
	readonly manifest: Readonly<{ name?: unknown }>;
}

/** Resolves a public package subpath and proves that its file remains inside the physical package. */
export function resolveExactPublicPackageEntry(
	node: ExactPublicPackageNode,
	subpath: string
): string {
	const name = typeof node.manifest.name === 'string' ? node.manifest.name : undefined;
	if (!name) throw new Error(`${node.location}/package.json must declare a package name`);
	const specifier = subpath === '.' ? name : `${name}${subpath.slice(1)}`;
	const require = createRequire(path.join(node.location, '__exact_package_provenance__.cjs'));
	let resolved: string;
	try {
		resolved = require.resolve(specifier);
	} catch (error) {
		throw new Error(`Unable to resolve public package entry ${specifier}`, { cause: error });
	}
	const relative = path.relative(node.realPath, resolved);
	if (relative.startsWith('..') || path.isAbsolute(relative))
		throw new Error(`Public package entry ${specifier} resolves outside ${node.location}`);
	return resolved;
}

/** Imports a containment-checked public package entry. */
export async function importExactPublicPackageEntry(
	node: ExactPublicPackageNode,
	subpath: string
): Promise<Record<string, unknown>> {
	const value = await import(pathToFileURL(resolveExactPublicPackageEntry(node, subpath)).href);
	return value as Record<string, unknown>;
}
