import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ExactCompilerSession } from '../expression/project.js';

/**
 * Local dependency facts discovered in one compiler-owned source pass.
 */
export interface PlacementDependencyAnalysis {
	readonly graph: ReadonlyMap<string, readonly string[]>;
	readonly localDependencies: ReadonlyMap<string, readonly { specifier: string; file: string }[]>;
}

/**
 * Discovers local source dependencies needed for placement and artifact rewriting.
 *
 * Newly discovered files are installed in `sources` so callers can analyze a
 * complete project graph without maintaining a second source-content store.
 * Native import facts are retained with their resolved files so the caller
 * never reparses source through the JavaScript compatibility compiler.
 */
export async function collectPlacementAnalysisDependencies(
	sources: Map<string, string>,
	session?: ExactCompilerSession
): Promise<PlacementDependencyAnalysis> {
	const graph = new Map<string, string[]>();
	const localDependencies = new Map<string, readonly { specifier: string; file: string }[]>();
	if (!session) throw new Error('Dependency discovery requires a native compiler session');
	const pending = [...sources.keys()];
	while (pending.length) {
		const filename = pending.shift()!;
		const source = sources.get(filename)!;
		const resolvedDependencies: string[] = [];
		const native = session.compileNative({
			id: filename,
			kind: 'analyze',
			source,
			diagnostics: 'syntax'
		});
		const fallback = await localModuleDependencyEntries(
			filename,
			source,
			native.analysis.imports
				.filter(
					(entry) =>
						!entry.resolvedFile ||
						// Declaration resolution supplies types, not the executable local edge.
						(entry.moduleSpecifier.startsWith('.') &&
							!entry.typeOnly &&
							(entry.runtimeBinding || entry.sideEffectOnly) &&
							/\.d\.[cm]?ts$/i.test(entry.resolvedFile))
				)
				.map((entry) => entry.moduleSpecifier)
		);
		const resolved = new Map(
			native.analysis.imports
				.filter(
					(edge) =>
						edge.resolvedFile &&
						!/\.d\.[cm]?ts$/i.test(edge.resolvedFile) &&
						!/(?:^|[\\/])node_modules(?:[\\/]|$)/.test(edge.resolvedFile) &&
						/\.[cm]?[jt]sx?$/i.test(edge.resolvedFile)
				)
				.map((edge) => [edge.moduleSpecifier, edge.resolvedFile!])
		);
		const local = fallback.map((edge) => ({
			...edge,
			file: resolved.get(edge.specifier) ?? edge.file
		}));
		for (const [specifier, file] of resolved)
			if (!local.some((edge) => edge.specifier === specifier)) local.push({ specifier, file });
		localDependencies.set(filename, [
			...new Map(local.map((edge) => [edge.specifier, edge])).values()
		]);
		const syntacticDependencies = local.map((entry) => entry.file);
		for (const dependency of syntacticDependencies) {
			const resolved = path.resolve(dependency);
			if (
				/(?:^|[\\/])node_modules(?:[\\/]|$)/.test(resolved) ||
				/\.d\.[cm]?ts$/i.test(resolved) ||
				!/\.[cm]?[jt]sx?$/i.test(resolved)
			) {
				continue;
			}
			try {
				await access(resolved);
				resolvedDependencies.push(resolved);
				if (!sources.has(resolved)) {
					sources.set(resolved, await readFile(resolved, 'utf8'));
					pending.push(resolved);
				}
			} catch {
				// TypeScript resolution considers extension substitutions that may not exist.
			}
		}
		graph.set(filename, [...new Set(resolvedDependencies)].sort());
	}
	return { graph, localDependencies };
}

/** Resolves authored relative module specifiers to local source files. */
export async function localModuleDependencyEntries(
	filename: string,
	_source: string,
	nativeSpecifiers: readonly string[]
): Promise<Array<{ specifier: string; file: string }>> {
	const specifiers = nativeSpecifiers.filter((specifier) => specifier.startsWith('.'));
	const dependencies: Array<{ specifier: string; file: string }> = [];
	for (const specifier of specifiers) {
		const absolute = path.resolve(path.dirname(filename), specifier);
		const extension = path.extname(absolute);
		const stem = /\.[cm]?[jt]sx?$/i.test(extension)
			? absolute.slice(0, -extension.length)
			: absolute;
		const candidates = [
			absolute,
			`${stem}.ts`,
			`${stem}.tsx`,
			`${stem}.mts`,
			`${stem}.cts`,
			`${stem}.js`,
			`${stem}.jsx`,
			path.join(absolute, 'index.ts'),
			path.join(absolute, 'index.tsx'),
			path.join(absolute, 'index.js')
		];
		for (const candidate of candidates) {
			try {
				await access(candidate);
				dependencies.push({ specifier, file: path.resolve(candidate) });
				break;
			} catch {
				// Continue through the same extension order used by the compiler.
			}
		}
	}
	return [
		...new Map(
			dependencies.map((dependency) => [`${dependency.specifier}\0${dependency.file}`, dependency])
		).values()
	];
}

/** Returns every dependency reachable from an entry without including the entry itself. */
export function transitiveDependencies(
	entry: string,
	graph: ReadonlyMap<string, readonly string[]>
): string[] {
	const result = new Set<string>();
	const pending = [...(graph.get(entry) ?? [])];
	while (pending.length) {
		const dependency = pending.shift()!;
		if (result.has(dependency)) continue;
		result.add(dependency);
		pending.push(...(graph.get(dependency) ?? []));
	}
	return [...result];
}
