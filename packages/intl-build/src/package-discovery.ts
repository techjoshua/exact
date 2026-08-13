import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { loadIntlPackagePublication, type IntlPackagePublication } from './package-publication.js';

const maximumDependencyPackages = 4096;

/** Discovers inert intl publications across the application's installed dependency graph. */
export async function discoverIntlPackagePublications(options: {
	applicationRoot: string;
	locales: readonly string[];
}): Promise<readonly IntlPackagePublication[]> {
	const applicationRoot = path.resolve(options.applicationRoot);
	const rootManifest = await readManifest(path.join(applicationRoot, 'package.json'));
	const queue = dependencyNames(rootManifest, true).map((name) => ({
		name,
		from: applicationRoot
	}));
	const visited = new Set<string>();
	const publications: IntlPackagePublication[] = [];
	while (queue.length > 0) {
		if (visited.size >= maximumDependencyPackages)
			throw new Error(`Intl dependency discovery exceeds ${maximumDependencyPackages} packages`);
		const request = queue.shift()!;
		const packageJsonPath = await resolveDependencyManifest(
			request.name,
			request.from,
			applicationRoot
		);
		if (!packageJsonPath) continue;
		const identity = await realpath(packageJsonPath).catch(() => packageJsonPath);
		if (visited.has(identity)) continue;
		visited.add(identity);
		const manifest = await readManifest(packageJsonPath);
		const publication = await loadIntlPackagePublication({
			packageJsonPath,
			locales: options.locales
		});
		if (publication) publications.push(publication);
		const packageRoot = path.dirname(packageJsonPath);
		for (const name of dependencyNames(manifest, false)) queue.push({ name, from: packageRoot });
	}
	return Object.freeze(publications);
}

async function resolveDependencyManifest(
	name: string,
	from: string,
	boundary: string
): Promise<string | undefined> {
	let current = path.resolve(from);
	const root = path.parse(current).root;
	while (true) {
		const candidate = path.join(current, 'node_modules', ...name.split('/'), 'package.json');
		try {
			await readFile(candidate, 'utf8');
			return candidate;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		}
		if (current === root) return undefined;
		const parent = path.dirname(current);
		if (parent === current) return undefined;
		current = parent;
		if (path.relative(boundary, current).startsWith('..') && !isAncestor(current, boundary))
			return undefined;
	}
}

function dependencyNames(manifest: Record<string, unknown>, includeDevelopment: boolean): string[] {
	const fields = [
		'dependencies',
		'optionalDependencies',
		...(includeDevelopment ? ['devDependencies'] : [])
	];
	return [
		...new Set(
			fields.flatMap((field) => {
				const value = manifest[field];
				return value && typeof value === 'object' && !Array.isArray(value)
					? Object.keys(value as Record<string, unknown>)
					: [];
			})
		)
	].sort();
}

async function readManifest(filename: string): Promise<Record<string, unknown>> {
	const value = JSON.parse(await readFile(filename, 'utf8')) as unknown;
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new TypeError(`${filename} must contain a package manifest object`);
	return value as Record<string, unknown>;
}

function isAncestor(candidate: string, descendant: string): boolean {
	const relative = path.relative(candidate, descendant);
	return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
