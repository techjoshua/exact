import type { ExactPackageManifest } from '@exact/plugin-api';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

export type ExactDependencyKind = 'dependency' | 'optional' | 'peer';

export interface ExactPackageDependency {
	readonly name: string;
	readonly range: string;
	readonly kind: ExactDependencyKind;
	readonly targetId?: string;
}

export interface ExactPackageNode {
	readonly id: string;
	readonly location: string;
	readonly realPath: string;
	readonly manifest: ExactPackageManifest;
	readonly dependencies: ReadonlyMap<string, ExactPackageDependency>;
}

export interface ExactPackageGraph {
	readonly rootId: string;
	readonly nodes: ReadonlyMap<string, ExactPackageNode>;
}

export function createExactPackageGraph(cwd = process.cwd()): ExactPackageGraph {
	try {
		return createNpmExactPackageGraph(cwd);
	} catch (error) {
		if (!isMissingDiscoveryFile(error)) throw error;
		return createInstalledExactPackageGraph(cwd);
	}
}

export function createNpmExactPackageGraph(cwd = process.cwd()): ExactPackageGraph {
	const applicationManifestFile = findUp(cwd, 'package.json');
	const lockFile = findUp(path.dirname(applicationManifestFile), 'package-lock.json');
	const lockRoot = path.dirname(lockFile);
	const lock = parseJson(readFileSync(lockFile, 'utf8'), lockFile) as {
		lockfileVersion?: unknown;
		packages?: unknown;
	};
	if (lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3) {
		throw new Error(`${lockFile} must use npm lockfileVersion 2 or 3`);
	}
	if (!isRecord(lock.packages))
		throw new Error(`${lockFile} does not contain an npm packages graph`);
	const records = lock.packages;
	const links = new Map<string, string>();
	for (const [id, raw] of Object.entries(records)) {
		if (!isRecord(raw) || raw.link !== true || typeof raw.resolved !== 'string') continue;
		links.set(normalizeId(id), normalizeId(raw.resolved));
	}
	const rawNodes = new Map<string, { location: string; manifest: ExactPackageManifest }>();
	for (const [rawId, entry] of Object.entries(records)) {
		if (!isRecord(entry) || entry.link === true) continue;
		const id = normalizeId(rawId);
		const location = path.resolve(lockRoot, rawId || '.');
		const manifestFile = path.join(location, 'package.json');
		let manifest: ExactPackageManifest = entry;
		try {
			manifest = parseJson(
				readFileSync(manifestFile, 'utf8'),
				manifestFile
			) as ExactPackageManifest;
		} catch (error) {
			if (id === '' || !isMissingFileError(error)) throw error;
		}
		rawNodes.set(id, { location, manifest });
	}
	const applicationId = normalizeId(path.relative(lockRoot, path.dirname(applicationManifestFile)));
	const rootId = applicationId === '.' ? '' : applicationId;
	if (!rawNodes.has(rootId))
		throw new Error(`${applicationManifestFile} is not represented in ${lockFile}`);
	const nodes = new Map<string, ExactPackageNode>();
	for (const [id, raw] of rawNodes) {
		const dependencies = new Map<string, ExactPackageDependency>();
		for (const dependency of dependencyDeclarations(raw.manifest)) {
			dependencies.set(
				dependency.name,
				Object.freeze({
					...dependency,
					targetId: resolveDependencyId(id, dependency.name, rawNodes, links)
				})
			);
		}
		nodes.set(id, freezeNode(id, raw.location, raw.manifest, dependencies));
	}
	return Object.freeze({ rootId, nodes });
}

export function createInstalledExactPackageGraph(cwd = process.cwd()): ExactPackageGraph {
	const rootManifestFile = findUp(cwd, 'package.json');
	const rootId = normalizeId(path.resolve(rootManifestFile));
	const pending = [rootManifestFile];
	const nodes = new Map<string, ExactPackageNode>();
	while (pending.length) {
		const manifestFile = path.resolve(pending.shift()!);
		const id = normalizeId(manifestFile);
		if (nodes.has(id)) continue;
		const manifest = parseJson(
			readFileSync(manifestFile, 'utf8'),
			manifestFile
		) as ExactPackageManifest;
		const location = path.dirname(manifestFile);
		const dependencies = new Map<string, ExactPackageDependency>();
		for (const dependency of dependencyDeclarations(manifest)) {
			const resolved = resolveInstalledManifest(location, dependency.name);
			dependencies.set(
				dependency.name,
				Object.freeze({
					...dependency,
					targetId: resolved ? normalizeId(path.resolve(resolved)) : undefined
				})
			);
			if (resolved && !nodes.has(normalizeId(path.resolve(resolved)))) pending.push(resolved);
		}
		nodes.set(id, freezeNode(id, location, manifest, dependencies));
	}
	return Object.freeze({ rootId, nodes });
}

export function packageName(node: ExactPackageNode): string {
	if (typeof node.manifest.name !== 'string' || !node.manifest.name) {
		throw new Error(`${node.location}/package.json must declare a package name`);
	}
	return node.manifest.name;
}

export function packageVersion(node: ExactPackageNode): string {
	if (typeof node.manifest.version !== 'string' || !node.manifest.version) {
		throw new Error(`${node.location}/package.json must declare a package version`);
	}
	return node.manifest.version;
}

export function dependencyDistance(graph: ExactPackageGraph): ReadonlyMap<string, number> {
	const result = new Map<string, number>([[graph.rootId, 0]]);
	const pending = [graph.rootId];
	while (pending.length) {
		const id = pending.shift()!;
		const node = graph.nodes.get(id);
		if (!node) continue;
		const distance = result.get(id)!;
		for (const dependency of node.dependencies.values()) {
			if (!dependency.targetId) continue;
			const next = distance + 1;
			if ((result.get(dependency.targetId) ?? Number.POSITIVE_INFINITY) <= next) continue;
			result.set(dependency.targetId, next);
			pending.push(dependency.targetId);
		}
	}
	return result;
}

export function findUp(cwd: string, filename: string): string {
	let directory = path.resolve(cwd);
	while (true) {
		const candidate = path.join(directory, filename);
		try {
			readFileSync(candidate, 'utf8');
			return candidate;
		} catch {}
		const parent = path.dirname(directory);
		if (parent === directory) throw new Error(`${filename} was not found above ${cwd}`);
		directory = parent;
	}
}

function freezeNode(
	id: string,
	location: string,
	manifest: ExactPackageManifest,
	dependencies: Map<string, ExactPackageDependency>
): ExactPackageNode {
	let realPath: string;
	try {
		realPath = realpathSync.native(location);
	} catch {
		realPath = path.resolve(location);
	}
	return Object.freeze({
		id,
		location: path.resolve(location),
		realPath: normalizeId(realPath),
		manifest,
		dependencies
	});
}

function dependencyDeclarations(manifest: ExactPackageManifest): ExactPackageDependency[] {
	const result = new Map<string, ExactPackageDependency>();
	addDependencies(result, manifest.dependencies, 'dependency');
	addDependencies(result, manifest.optionalDependencies, 'optional');
	addDependencies(result, manifest.peerDependencies, 'peer');
	return [...result.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function addDependencies(
	target: Map<string, ExactPackageDependency>,
	value: unknown,
	kind: ExactDependencyKind
): void {
	if (!isRecord(value)) return;
	for (const [name, range] of Object.entries(value)) {
		if (typeof range !== 'string' || !range) continue;
		const current = target.get(name);
		if (!current || dependencyKindPriority(kind) < dependencyKindPriority(current.kind)) {
			target.set(name, { name, range, kind });
		}
	}
}

function dependencyKindPriority(kind: ExactDependencyKind): number {
	return kind === 'dependency' ? 0 : kind === 'optional' ? 1 : 2;
}

function resolveDependencyId(
	fromId: string,
	name: string,
	nodes: ReadonlyMap<string, unknown>,
	links: ReadonlyMap<string, string>
): string | undefined {
	const candidates: string[] = [];
	let base = fromId;
	while (true) {
		candidates.push(normalizeId(path.posix.join(base, 'node_modules', name)));
		const marker = base.lastIndexOf('/node_modules/');
		if (marker < 0) break;
		base = base.slice(0, marker);
	}
	candidates.push(normalizeId(path.posix.join('node_modules', name)));
	for (const candidate of candidates) {
		const target = links.get(candidate) ?? candidate;
		if (nodes.has(target)) return target;
	}
	return undefined;
}

function resolveInstalledManifest(fromLocation: string, name: string): string | undefined {
	let directory = path.resolve(fromLocation);
	while (true) {
		const candidate = path.join(directory, 'node_modules', ...name.split('/'), 'package.json');
		try {
			readFileSync(candidate, 'utf8');
			return candidate;
		} catch {}
		const parent = path.dirname(directory);
		if (parent === directory) return undefined;
		directory = parent;
	}
}

function parseJson(source: string, filename: string): unknown {
	try {
		return JSON.parse(source);
	} catch (error) {
		throw new Error(`Unable to parse ${filename}`, { cause: error });
	}
}

function normalizeId(value: string): string {
	return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
	return isRecord(error) && error.code === 'ENOENT';
}

function isMissingDiscoveryFile(error: unknown): boolean {
	return (
		error instanceof Error &&
		(/package-lock\.json was not found/.test(error.message) ||
			/package\.json was not found/.test(error.message) ||
			/is not represented in .*package-lock\.json/.test(error.message))
	);
}
