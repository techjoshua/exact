import type { BoundModule, ExpressionProject } from '@exact/expressions';
import path from 'node:path';
import ts from 'typescript';

/** Normalizes a filename for use as a platform-stable project cache key. */
export function canonical(filename: string): string {
	const absolute = path.resolve(filename);
	return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

function dependencyCandidates(filename: string, specifier: string): readonly string[] {
	if (!specifier.startsWith('.')) return [];
	const resolved = path.resolve(path.dirname(filename), specifier);
	const extension = path.extname(resolved);
	const stem = extension ? resolved.slice(0, -extension.length) : resolved;
	return [
		...new Set([resolved, `${stem}.ts`, `${stem}.tsx`, `${stem}.mts`, `${stem}.cts`].map(canonical))
	];
}

/** Resolves both TypeScript-selected and plausible relative dependency filenames. */
export function moduleDependencies(
	filename: string,
	module: BoundModule,
	project: ExpressionProject
): readonly string[] {
	const dependencies = new Set<string>();
	const imports = ts.preProcessFile(module.source, true, true).importedFiles;
	for (const imported of imports) {
		const specifier = imported.fileName;
		const resolved = project.resolveModuleSpecifier(specifier, filename);
		if (resolved) dependencies.add(canonical(resolved));
		for (const candidate of dependencyCandidates(filename, specifier)) dependencies.add(candidate);
	}
	return [...dependencies];
}
