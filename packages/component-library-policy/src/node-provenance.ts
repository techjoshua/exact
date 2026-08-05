import { existsSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import type {
	ExactComponentAuthorizationSession,
	ExactResolvedDependencyEdge,
	ExactResolvedPackageInstance
} from './contracts.js';

/** Resolver-derived package evidence recorded for one component candidate. */
export type ExactNodeComponentProvenance = Readonly<{
	instance: ExactResolvedPackageInstance;
	watchFiles: readonly string[];
}>;

/** Inputs needed to join a bundler-resolved module to physical Node package provenance. */
export type RecordExactNodeComponentProvenanceOptions = Readonly<{
	session: ExactComponentAuthorizationSession;
	applicationRoot: string;
	importerModuleId: string;
	moduleSpecifier: string;
	resolvedModuleId: string;
}>;

/**
 * Records canonical package instances and declared dependency edges for one resolved module.
 * Manifests are parsed as data; candidate and marker implementation modules are never imported.
 */
export async function recordExactNodeComponentProvenance(
	options: RecordExactNodeComponentProvenanceOptions
): Promise<ExactNodeComponentProvenance> {
	const applicationRoot = await realpath(path.resolve(options.applicationRoot));
	const candidate = await packageInstanceForModule(options.resolvedModuleId);
	options.session.recordPackageInstance(candidate.instance);
	const watchFiles = new Set<string>([candidate.instance.manifestPath]);
	const applicationManifestPath = findPackageManifest(applicationRoot);
	if (!applicationManifestPath)
		throw new Error(`No application package.json found from ${applicationRoot}`);
	const applicationManifest = await readManifest(applicationManifestPath);
	const importer = await optionalPackageInstanceForModule(options.importerModuleId);
	const importerIsApplication =
		!importer ||
		path.resolve(importer.instance.root) === path.resolve(path.dirname(applicationManifestPath));
	if (importer && !importerIsApplication) {
		options.session.recordPackageInstance(importer.instance);
		watchFiles.add(importer.instance.manifestPath);
	}
	const ownerManifest = importerIsApplication ? applicationManifest : importer!.manifest;
	const kind = dependencyKind(ownerManifest, options.moduleSpecifier, candidate.instance.name);
	if (kind) {
		options.session.recordDependencyEdge({
			owner: importerIsApplication ? 'application' : importer!.instance.key,
			candidate: candidate.instance.key,
			specifier: options.moduleSpecifier,
			kind
		});
	}
	const marker = await optionalResolvedDependency(candidate, '@exactjs/component-library');
	if (marker) {
		options.session.recordPackageInstance(marker.instance);
		options.session.recordDependencyEdge({
			owner: candidate.instance.key,
			candidate: marker.instance.key,
			specifier: '@exactjs/component-library',
			kind: 'dependency'
		});
		watchFiles.add(marker.instance.manifestPath);
	}
	return Object.freeze({
		instance: candidate.instance,
		watchFiles: Object.freeze([...watchFiles].sort())
	});
}

type ResolvedPackage = Readonly<{
	instance: ExactResolvedPackageInstance;
	manifest: PackageManifest;
}>;
type PackageManifest = Readonly<{
	name?: string;
	version?: string;
	dependencies?: Readonly<Record<string, string>>;
	devDependencies?: Readonly<Record<string, string>>;
	peerDependencies?: Readonly<Record<string, string>>;
	optionalDependencies?: Readonly<Record<string, string>>;
}>;

async function packageInstanceForModule(moduleId: string): Promise<ResolvedPackage> {
	const clean = moduleId.replace(/[?#].*$/, '');
	const manifestPath = findPackageManifest(path.dirname(path.resolve(clean)));
	if (!manifestPath) throw new Error(`Resolved module has no package boundary: ${moduleId}`);
	const packageRoot = await realpath(path.dirname(manifestPath));
	const canonicalManifestPath = path.join(packageRoot, 'package.json');
	const manifest = await readManifest(canonicalManifestPath);
	if (!manifest.name || !manifest.version)
		throw new Error(`Resolved package manifest lacks name/version: ${canonicalManifestPath}`);
	return Object.freeze({
		manifest,
		instance: Object.freeze({
			key: packageRoot,
			root: packageRoot,
			manifestPath: canonicalManifestPath,
			name: manifest.name,
			version: manifest.version
		})
	});
}

async function optionalPackageInstanceForModule(
	moduleId: string
): Promise<ResolvedPackage | undefined> {
	if (!moduleId || moduleId.startsWith('\0') || !path.isAbsolute(moduleId.replace(/[?#].*$/, '')))
		return undefined;
	try {
		return await packageInstanceForModule(moduleId);
	} catch {
		return undefined;
	}
}

async function optionalResolvedDependency(
	owner: ResolvedPackage,
	specifier: string
): Promise<ResolvedPackage | undefined> {
	if (!owner.manifest.dependencies?.[specifier]) return undefined;
	try {
		const manifestPath = createRequire(owner.instance.manifestPath).resolve(
			`${specifier}/package.json`
		);
		return await packageInstanceForModule(manifestPath);
	} catch {
		return undefined;
	}
}

function dependencyKind(
	manifest: PackageManifest,
	authoredSpecifier: string,
	resolvedName: string
): ExactResolvedDependencyEdge['kind'] | undefined {
	const names = [authoredPackageName(authoredSpecifier), resolvedName];
	for (const name of names) {
		if (manifest.optionalDependencies?.[name]) return 'optionalDependency';
		if (manifest.dependencies?.[name]) return 'dependency';
		if (manifest.peerDependencies?.[name]) return 'peerDependency';
		if (manifest.devDependencies?.[name]) return 'devDependency';
	}
	return undefined;
}

function authoredPackageName(specifier: string): string {
	const parts = specifier.split('/');
	return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
}

function findPackageManifest(start: string): string | undefined {
	let directory = path.resolve(start);
	while (true) {
		const candidate = path.join(directory, 'package.json');
		if (existsSync(candidate)) return candidate;
		const parent = path.dirname(directory);
		if (parent === directory) return undefined;
		directory = parent;
	}
}

async function readManifest(manifestPath: string): Promise<PackageManifest> {
	return JSON.parse(await readFile(manifestPath, 'utf8')) as PackageManifest;
}
