import { type PackageManifestLike } from '@exact/react-compat-adapter-api';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ReactCompatPackageGraph, ReactCompatPackageNode } from './contracts.js';

/** Creates a npm react compat package graph. */
export function createNpmReactCompatPackageGraph(cwd = process.cwd()): ReactCompatPackageGraph {
	const applicationManifestFile = findUp(cwd, 'package.json');
	const lockFile = findUp(path.dirname(applicationManifestFile), 'package-lock.json');
	const lockRoot = path.dirname(lockFile);
	const lock = parseJson(readFileSync(lockFile, 'utf8'), lockFile) as {
		lockfileVersion?: unknown;
		packages?: unknown;
	};
	if (lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3)
		throw new Error(`${lockFile} must use npm lockfileVersion 2 or 3`);
	if (!isRecord(lock.packages))
		throw new Error(`${lockFile} does not contain an npm packages graph`);
	const records = lock.packages;
	const links = new Map<string, string>();
	for (const [id, raw] of Object.entries(records)) {
		if (!isRecord(raw) || raw.link !== true || typeof raw.resolved !== 'string') continue;
		links.set(normalizeId(id), normalizeId(raw.resolved));
	}
	const rawNodes = new Map<
		string,
		{ location: string; manifest: PackageManifestLike; dependencyNames: string[] }
	>();
	for (const [rawId, lockEntry] of Object.entries(records)) {
		if (!isRecord(lockEntry) || lockEntry.link === true) continue;
		const id = normalizeId(rawId);
		const location = path.resolve(lockRoot, rawId || '.');
		const manifestFile = path.join(location, 'package.json');
		let manifest: PackageManifestLike = lockEntry;
		try {
			manifest = parseJson(readFileSync(manifestFile, 'utf8'), manifestFile) as PackageManifestLike;
		} catch (error) {
			if (id === '' || !isMissingFileError(error)) throw error;
		}
		const dependencyNames = [
			...new Set([
				...objectKeys(manifest.dependencies),
				...objectKeys(manifest.optionalDependencies),
				...objectKeys(manifest.peerDependencies)
			])
		].sort();
		rawNodes.set(id, { location, manifest, dependencyNames });
	}
	const applicationId = normalizeId(path.relative(lockRoot, path.dirname(applicationManifestFile)));
	const rootId = applicationId === '.' ? '' : applicationId;
	if (!rawNodes.has(rootId))
		throw new Error(`${applicationManifestFile} is not represented in ${lockFile}`);
	const nodes = new Map<string, ReactCompatPackageNode>();
	for (const [id, node] of rawNodes) {
		const dependencies = node.dependencyNames
			.map((name) => resolveDependencyId(id, name, rawNodes, links))
			.filter((value): value is string => value !== undefined);
		// Running at a workspace root models npm's workspace forest as reachable.
		if (id === '' && rootId === '') {
			for (const workspaceId of rawNodes.keys())
				if (workspaceId && !workspaceId.startsWith('node_modules/')) dependencies.push(workspaceId);
		}
		nodes.set(
			id,
			Object.freeze({
				id,
				location: node.location,
				manifest: node.manifest,
				dependencies: Object.freeze([...new Set(dependencies)].sort())
			})
		);
	}
	return Object.freeze({ rootId, nodes });
}

/** Uses npm metadata when present and falls back to the installed package tree. */
export function createReactCompatPackageGraph(cwd = process.cwd()): ReactCompatPackageGraph {
	try {
		return createNpmReactCompatPackageGraph(cwd);
	} catch (error) {
		if (!isMissingDiscoveryFile(error)) throw error;
		return createInstalledReactCompatPackageGraph(cwd);
	}
}

/** Walks a Node-compatible installed tree without relying on a package-manager command. */
export function createInstalledReactCompatPackageGraph(
	cwd = process.cwd()
): ReactCompatPackageGraph {
	const rootManifestFile = findUp(cwd, 'package.json');
	const rootId = normalizeId(path.resolve(rootManifestFile));
	const pending = [rootManifestFile];
	const nodes = new Map<string, ReactCompatPackageNode>();
	while (pending.length) {
		const manifestFile = path.resolve(pending.shift()!);
		const id = normalizeId(manifestFile);
		if (nodes.has(id)) continue;
		const manifest = parseJson(
			readFileSync(manifestFile, 'utf8'),
			manifestFile
		) as PackageManifestLike;
		const location = path.dirname(manifestFile);
		const dependencyNames = [
			...new Set([
				...objectKeys(manifest.dependencies),
				...objectKeys(manifest.optionalDependencies),
				...objectKeys(manifest.peerDependencies)
			])
		].sort();
		const dependencyFiles: string[] = [];
		for (const name of dependencyNames) {
			const resolved = resolveInstalledManifest(location, name);
			if (!resolved) continue;
			dependencyFiles.push(resolved);
			if (!nodes.has(normalizeId(resolved))) pending.push(resolved);
		}
		nodes.set(
			id,
			Object.freeze({
				id,
				location,
				manifest,
				dependencies: Object.freeze(dependencyFiles.map(normalizeId).sort())
			})
		);
	}
	return Object.freeze({ rootId, nodes });
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

function findUp(cwd: string, filename: string): string {
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

function resolveInstalledManifest(fromLocation: string, packageName: string): string | undefined {
	let directory = path.resolve(fromLocation);
	while (true) {
		const candidate = path.join(
			directory,
			'node_modules',
			...packageName.split('/'),
			'package.json'
		);
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
function objectKeys(value: unknown): string[] {
	return isRecord(value) ? Object.keys(value) : [];
}
/** Reports whether record. */
export function isRecord(value: unknown): value is Record<string, unknown> {
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
