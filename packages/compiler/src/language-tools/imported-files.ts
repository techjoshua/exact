import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NativeCompilerResponse } from '../native/process-contracts.js';

/** Resolves relative imports reported by native analysis into watched source candidates. */
export function importedLanguageFiles(
	filename: string,
	response: NativeCompilerResponse,
	root: string
): ReadonlySet<string> {
	const directory = path.dirname(filename);
	return new Set(
		response.analysis.imports
			.filter((entry) => entry.moduleSpecifier.startsWith('.'))
			.map((entry) => {
				const base = path.resolve(directory, entry.moduleSpecifier);
				for (const candidate of [
					base,
					`${base}.ts`,
					`${base}.tsx`,
					`${base}.js`,
					`${base}.jsx`,
					path.join(base, 'index.ts'),
					path.join(base, 'index.tsx')
				]) {
					if (existsSync(candidate)) return candidate;
				}
				return path.resolve(root, base);
			})
	);
}
