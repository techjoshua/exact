import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ExactPackageNode } from './graph.js';

/** Resolves a public package entry. */
export function resolvePublicPackageEntry(node: ExactPackageNode, subpath: string): string {
	const name = typeof node.manifest.name === 'string' ? node.manifest.name : undefined;
	if (!name) throw new Error(`${node.location}/package.json must declare a package name`);
	const specifier = subpath === '.' ? name : `${name}${subpath.slice(1)}`;
	const require = createRequire(path.join(node.location, '__exact_plugin_host__.cjs'));
	let resolved: string;
	try {
		resolved = require.resolve(specifier);
	} catch (error) {
		throw new Error(`Unable to resolve public plugin entry ${specifier}`, { cause: error });
	}
	const relative = path.relative(node.realPath, resolved);
	if (relative.startsWith('..') || path.isAbsolute(relative)) {
		throw new Error(`Public plugin entry ${specifier} resolves outside ${node.location}`);
	}
	return resolved;
}

/** Performs the import public package entry domain operation. */
export async function importPublicPackageEntry(
	node: ExactPackageNode,
	subpath: string
): Promise<Record<string, unknown>> {
	const resolved = resolvePublicPackageEntry(node, subpath);
	const value = await import(pathToFileURL(resolved).href);
	return value as Record<string, unknown>;
}
