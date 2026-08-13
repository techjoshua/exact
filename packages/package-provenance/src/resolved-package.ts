import { readFile, realpath } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/** Canonical physical package selected from one Node resolution base. */
export interface ExactResolvedNodePackage {
	readonly key: string;
	readonly name: string;
	readonly version: string;
	readonly location: string;
	readonly realPath: string;
	readonly manifestPath: string;
	readonly manifest: Readonly<Record<string, unknown>>;
	readonly integrity?: string;
}

/** Resolves a package manifest from a workspace without walking unrelated dependencies. */
export async function resolveExactNodePackage(
	workspaceRoot: string,
	packageName: string
): Promise<ExactResolvedNodePackage> {
	const require = createRequire(path.join(path.resolve(workspaceRoot), '__exact_provenance__.cjs'));
	let manifestPath: string;
	try {
		manifestPath = require.resolve(`${packageName}/package.json`);
	} catch (error) {
		try {
			manifestPath = findOwningManifest(require.resolve(packageName), packageName);
		} catch (entryError) {
			throw new Error(`Unable to resolve package ${packageName} from ${workspaceRoot}`, {
				cause: entryError instanceof Error ? entryError : error
			});
		}
	}
	const location = path.dirname(manifestPath);
	const realPath = await realpath(location);
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
	if (manifest.name !== packageName || typeof manifest.version !== 'string' || !manifest.version)
		throw new Error(`${manifestPath} does not describe ${packageName} with a valid version`);
	return Object.freeze({
		key: `${realPath}\0${packageName}\0${manifest.version}`,
		name: packageName,
		version: manifest.version,
		location,
		realPath,
		manifestPath,
		manifest: Object.freeze(manifest),
		...(await lockfileIntegrity(workspaceRoot, location))
	});
}

async function lockfileIntegrity(
	workspaceRoot: string,
	packageLocation: string
): Promise<Readonly<{ integrity: string }> | undefined> {
	let directory = path.resolve(workspaceRoot);
	while (true) {
		const filename = path.join(directory, 'package-lock.json');
		if (existsSync(filename)) {
			try {
				const lock = JSON.parse(await readFile(filename, 'utf8')) as {
					packages?: Record<string, { integrity?: unknown }>;
				};
				const key = path.relative(directory, packageLocation).replaceAll(path.sep, '/');
				const integrity = lock.packages?.[key]?.integrity;
				return typeof integrity === 'string' && integrity ? { integrity } : undefined;
			} catch {
				return undefined;
			}
		}
		const parent = path.dirname(directory);
		if (parent === directory) return undefined;
		directory = parent;
	}
}

function findOwningManifest(entry: string, packageName: string): string {
	let directory = path.dirname(entry);
	while (true) {
		const manifestPath = path.join(directory, 'package.json');
		if (existsSync(manifestPath)) {
			try {
				const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: unknown };
				if (manifest.name === packageName) return manifestPath;
			} catch {}
		}
		const parent = path.dirname(directory);
		if (parent === directory) throw new Error(`No ${packageName} package boundary owns ${entry}`);
		directory = parent;
	}
}
