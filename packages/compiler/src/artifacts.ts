import { existsSync } from 'node:fs';
import path from 'node:path';
import { packageExportSpecifier, packageExportTarget, sortPlanEntries } from './paths.js';
import { clientIslandRegistryEntries, serverPartRegistryEntries } from './registry.js';
import type {
	CompileArtifactsResult,
	ExactArtifactComponentEdge,
	ExactArtifactGraph,
	ExactArtifactGraphEntry,
	ExactArtifactGraphInput,
	ExactArtifactGraphOptions,
	ExactArtifactImportResolution,
	ExactArtifactPlan,
	ExactArtifactPlanDiff,
	ExactArtifactPlanDiffOptions,
	ExactArtifactPlanEntry,
	ExactArtifactTarget,
	ExactExportConditionOptions,
	PackageExportEntry,
	PackageExportMapOptions
} from './types.js';

/** Converts a compile result into the graph entry shape used by artifact tooling. */
export function artifactGraphEntryFromCompileResult(
	result: CompileArtifactsResult
): ExactArtifactGraphEntry {
	return {
		inputFile: result.inputFile,
		clientFile: result.clientFile,
		serverFile: result.serverFile,
		...(result.sharedFile ? { sharedFile: result.sharedFile } : {}),
		build: artifactGraphBuildProduct(result.build)
	};
}

/** Diffs two artifact plans into added, removed, changed, and retained entries. */
export function diffExactArtifactPlans(
	previous: ExactArtifactPlan,
	next: ExactArtifactPlan,
	options: ExactArtifactPlanDiffOptions = {}
): ExactArtifactPlanDiff {
	const previousByInput = new Map(
		previous.entries.map((entry) => [path.resolve(entry.inputFile), entry])
	);
	const nextByInput = new Map(next.entries.map((entry) => [path.resolve(entry.inputFile), entry]));
	const changedInputs = new Set((options.changedInputs ?? []).map((file) => path.resolve(file)));
	const added: ExactArtifactPlanEntry[] = [];
	const removed: ExactArtifactPlanEntry[] = [];
	const changed: ExactArtifactPlanEntry[] = [];
	const retained: ExactArtifactPlanEntry[] = [];

	for (const [inputFile, entry] of nextByInput) {
		if (!previousByInput.has(inputFile)) {
			added.push(entry);
		} else if (changedInputs.has(inputFile)) {
			changed.push(entry);
		} else {
			retained.push(entry);
		}
	}
	for (const [inputFile, entry] of previousByInput) {
		if (!nextByInput.has(inputFile)) removed.push(entry);
	}

	return {
		added: sortPlanEntries(added),
		removed: sortPlanEntries(removed),
		changed: sortPlanEntries(changed),
		retained: sortPlanEntries(retained)
	};
}

/** Creates conditional package exports for generated client/server component artifacts. */
export function createPackageExportMap(
	results: readonly ExactArtifactGraphInput[],
	options: PackageExportMapOptions
): Record<string, PackageExportEntry> {
	const clientCondition = options.clientCondition ?? 'exact-client';
	const serverCondition = options.serverCondition ?? 'exact-server';
	const output: Record<string, PackageExportEntry> = {};

	for (const result of results) {
		const specifier = packageExportSpecifier(
			result.inputFile,
			options.sourceRoot ?? options.packageRoot
		);
		const client = packageExportTarget(result.clientFile, options.packageRoot);
		const server = packageExportTarget(result.serverFile, options.packageRoot);
		output[specifier] = {
			...(options.typesRoot
				? {
						types: packageExportTarget(
							path.join(
								options.typesRoot,
								path
									.relative(options.sourceRoot ?? options.packageRoot, result.inputFile)
									.replace(/\.[cm]?[jt]sx?$/i, '.d.ts')
							),
							options.packageRoot
						)
					}
				: {}),
			[clientCondition]: client,
			[serverCondition]: server,
			default: options.defaultTarget === 'server' ? server : client
		};
	}

	return output;
}

/** Fails when a resolved conditional export does not match the consuming target. */
export function assertExactArtifactTarget(
	entry: ExactArtifactGraphInput,
	resolvedFile: string,
	target: ExactArtifactTarget
): void {
	const expected = path.resolve(target === 'client' ? entry.clientFile : entry.serverFile);
	const resolved = path.resolve(resolvedFile);
	if (resolved !== expected) {
		throw new Error(
			`eXact ${target} build resolved ${resolvedFile}, expected ${target === 'client' ? entry.clientFile : entry.serverFile}`
		);
	}
}

/** Returns the package export conditions used to select a client or server artifact. */
export function exactExportConditions(
	target: ExactArtifactTarget,
	options: ExactExportConditionOptions = {}
): string[] {
	return [
		target === 'server'
			? (options.serverCondition ?? 'exact-server')
			: (options.clientCondition ?? 'exact-client')
	];
}

/** Resolves a virtual .exact facade import to the generated client or server artifact path. */
export function resolveExactArtifactImport(
	source: string,
	importer: string | undefined,
	target: ExactArtifactTarget
): ExactArtifactImportResolution | null {
	if (!source.endsWith('.exact')) return null;
	const base = `${source}.${target}`;
	const resolved = resolveArtifactCandidate(base, importer);
	return {
		id: resolved,
		target
	};
}

function resolveArtifactCandidate(base: string, importer: string | undefined): string {
	const candidateBase =
		!importer || path.isAbsolute(base) ? base : path.resolve(path.dirname(importer), base);
	for (const extension of artifactExtensionPreference(importer)) {
		const candidate = `${candidateBase}${extension}`;
		if (existsSync(candidate)) return candidate;
	}
	// During early resolver passes the artifact may not exist yet; fall back to the
	// extension that matches the importing source language.
	return `${candidateBase}${artifactExtensionPreference(importer)[0]}`;
}

function artifactExtensionPreference(
	importer: string | undefined
): ['.ts', '.js'] | ['.js', '.ts'] {
	const extension = importer ? path.extname(importer).toLowerCase() : '';
	return extension === '.js' || extension === '.jsx' ? ['.js', '.ts'] : ['.ts', '.js'];
}

/** Builds the aggregate graph used by package exports and client/server registries. */
export function createExactArtifactGraph(
	results: readonly ExactArtifactGraphInput[],
	options: ExactArtifactGraphOptions
): ExactArtifactGraph {
	return {
		conditions: {
			client: exactExportConditions('client', options),
			server: exactExportConditions('server', options)
		},
		packageExports: createPackageExportMap(results, options),
		componentEdges: createExactArtifactComponentEdges(results),
		clientIslands: clientIslandRegistryEntries(results, {
			rootDir: options.rootDir ?? options.packageRoot
		}),
		serverParts: serverPartRegistryEntries(results, {
			rootDir: options.rootDir ?? options.packageRoot
		}),
		continuations: uniqueBuildRecords(results.flatMap((result) => result.build.continuations)),
		execution: {
			operations: uniqueBuildRecords(
				results.flatMap((result) => result.build.execution.operations)
			),
			boundaries: uniqueBuildRecords(results.flatMap((result) => result.build.execution.boundaries))
		},
		artifacts: results.map((result) => ({
			inputFile: result.inputFile,
			clientFile: result.clientFile,
			serverFile: result.serverFile,
			...(result.sharedFile ? { sharedFile: result.sharedFile } : {}),
			build: artifactGraphBuildProduct(result.build)
		}))
	};
}

/** Extracts render edges across compiled artifact analyses. */
export function createExactArtifactComponentEdges(
	results: readonly ExactArtifactGraphInput[]
): ExactArtifactComponentEdge[] {
	const edges: ExactArtifactComponentEdge[] = [];
	for (const result of results) {
		edges.push(...result.build.componentEdges);
	}
	return edges.sort((left, right) =>
		[
			left.sourceFile,
			left.sourceName,
			String(left.index).padStart(6, '0'),
			left.tag,
			left.targetName
		]
			.join(':')
			.localeCompare(
				[
					right.sourceFile,
					right.sourceName,
					String(right.index).padStart(6, '0'),
					right.tag,
					right.targetName
				].join(':')
			)
	);
}

function artifactGraphBuildProduct(
	build: ExactArtifactGraphInput['build']
): ExactArtifactGraphEntry['build'] {
	return build;
}

function uniqueBuildRecords<T extends { readonly id: string }>(records: readonly T[]): T[] {
	const byId = new Map<string, T>();
	for (const record of records) {
		const previous = byId.get(record.id);
		if (previous && JSON.stringify(previous) !== JSON.stringify(record))
			throw new Error(`Conflicting eXact build product ${record.id}`);
		byId.set(record.id, record);
	}
	return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}
