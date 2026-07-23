import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import type { ExactCompilerSession } from '../expression/project.js';
import { expressionDependencyFiles } from '../expression/session.js';

/**
 * Discovers local source dependencies needed for placement analysis.
 *
 * Newly discovered files are installed in `sources` so callers can analyze a
 * complete project graph without maintaining a second source-content store.
 */
export async function collectPlacementAnalysisDependencies(
	sources: Map<string, string>,
	session?: ExactCompilerSession
): Promise<Map<string, string[]>> {
	const graph = new Map<string, string[]>();
	const pending = [...sources.keys()];
	while (pending.length) {
		const filename = pending.shift()!;
		const source = sources.get(filename)!;
		const resolvedDependencies: string[] = [];
		const semanticDependencies = session
			? session.expressionDependencyFiles(filename, source)
			: expressionDependencyFiles(filename, source);
		const syntacticDependencies = (await localModuleDependencyEntries(filename, source)).map(
			(entry) => entry.file
		);
		for (const dependency of [...semanticDependencies, ...syntacticDependencies]) {
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
	return graph;
}

/** Resolves authored relative module specifiers to local source files. */
export async function localModuleDependencyEntries(
	filename: string,
	source: string
): Promise<Array<{ specifier: string; file: string }>> {
	const sourceFile = ts.createSourceFile(
		filename,
		source,
		ts.ScriptTarget.ES2022,
		true,
		ts.ScriptKind.TSX
	);
	const specifiers = sourceFile.statements.flatMap((statement) => {
		if (
			(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
			statement.moduleSpecifier &&
			ts.isStringLiteral(statement.moduleSpecifier) &&
			statement.moduleSpecifier.text.startsWith('.')
		) {
			return [statement.moduleSpecifier.text];
		}
		return [];
	});
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
