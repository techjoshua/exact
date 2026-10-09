import { readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Reports whether an application can supply this framework package without evaluating it.
 * Adapters use their own resolver and export conditions after selecting the application root.
 * Missing application packages retain normal importer-relative resolution for library-only providers.
 */
export function applicationOwnsExactFrameworkPackage(
	request: string,
	applicationRoot: string
): boolean {
	const name = /^(@exactjs\/[^/?#]+)/.exec(request)?.[1];
	if (!name) return false;
	// Package ownership is independent of its root export or the resolver's active conditions.
	for (const directory of createRequire(
		path.join(path.resolve(applicationRoot), 'package.json')
	).resolve.paths(name) ?? []) {
		try {
			if (statSync(path.join(directory, name, 'package.json')).isFile()) return true;
		} catch (error) {
			if (
				(error as NodeJS.ErrnoException).code !== 'ENOENT' &&
				(error as NodeJS.ErrnoException).code !== 'ENOTDIR'
			)
				throw error;
		}
	}
	return false;
}

/** Lists resolvable framework packages for hosts with a declarative package-deduplication option. */
export function applicationExactFrameworkPackages(applicationRoot: string): string[] {
	const names = new Set<string>();
	let directory = path.resolve(applicationRoot);
	while (true) {
		try {
			for (const name of readdirSync(path.join(directory, 'node_modules/@exactjs'))) {
				const specifier = '@exactjs/' + name;
				if (applicationOwnsExactFrameworkPackage(specifier, applicationRoot)) names.add(specifier);
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		}
		const parent = path.dirname(directory);
		if (parent === directory) break;
		directory = parent;
	}
	return [...names].sort();
}
