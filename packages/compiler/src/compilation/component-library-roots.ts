import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Finds declared participating libraries without evaluating their exports.
 * Test hosts use these physical roots to keep library registrations in their
 * module runner. Discovery grants no execution authority, which remains resolver-owned.
 */
export async function applicationExactComponentLibraryRoots(
	root: string
): Promise<readonly string[]> {
	const libraries = await applicationExactComponentLibraries(root);
	return Object.freeze([...new Set(libraries.map((library) => library.root))].sort());
}

/** Finds declared import names for adapter-owned traversal, without granting execution authority. */
export async function applicationExactComponentLibraryNames(
	root: string
): Promise<readonly string[]> {
	const libraries = await applicationExactComponentLibraries(root);
	return Object.freeze([...new Set(libraries.map((library) => library.name))].sort());
}

async function applicationExactComponentLibraries(root: string) {
	const libraries: { name: string; root: string }[] = [];
	const visited = new Set<string>();
	const pending = [path.resolve(root)];
	while (pending.length) {
		const owner = pending.pop()!;
		if (visited.has(owner)) continue;
		visited.add(owner);
		const manifest = await readManifest(path.join(owner, 'package.json'));
		if (!manifest) continue;
		const require = createRequire(path.join(owner, '__exact_libraries__.cjs'));
		for (const field of [
			'dependencies',
			'optionalDependencies',
			'devDependencies',
			'peerDependencies'
		]) {
			const dependencies = manifest[field];
			if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies))
				continue;
			for (const name of Object.keys(dependencies)) {
				if (!/^(?:@[^/]+\/)?[^./][^/]*$/u.test(name)) continue;
				for (const directory of require.resolve.paths(name) ?? []) {
					const location = path.join(directory, name);
					const dependency = await readManifest(path.join(location, 'package.json'));
					if (!dependency) continue;
					if (
						dependency.exactComponentLibrary &&
						typeof dependency.exactComponentLibrary === 'object' &&
						!Array.isArray(dependency.exactComponentLibrary)
					) {
						const physical = await realpath(location);
						libraries.push({ name, root: physical });
						pending.push(physical);
					}
					break;
				}
			}
		}
	}
	return libraries;
}

async function readManifest(filename: string): Promise<Record<string, unknown> | undefined> {
	try {
		const value: unknown = JSON.parse(await readFile(filename, 'utf8'));
		if (!value || typeof value !== 'object' || Array.isArray(value))
			throw new Error(`Invalid package manifest object in ${filename}`);
		return value as Record<string, unknown>;
	} catch (error) {
		if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? ''))
			return undefined;
		throw error;
	}
}
