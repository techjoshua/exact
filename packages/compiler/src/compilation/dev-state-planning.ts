import path from 'node:path';
import type { ExactArtifactGraphEntry } from '../types.js';

/**
 * Expands changed inputs to include artifacts whose retained analyses depend on them.
 *
 * Dependencies are stored relative to the analysis source filename,
 * while watcher inputs are absolute or workspace-relative paths. Normalizing at
 * this boundary prevents platform-specific path spelling from hiding changes.
 */
export function affectedArtifactInputs(
	entries: readonly ExactArtifactGraphEntry[],
	changedInputs: readonly string[]
): string[] {
	const changed = new Set(changedInputs.map((input) => path.resolve(input)));
	const affected = new Set(changed);
	for (const entry of entries) {
		if (
			entry.analysis.dependencies.some((dependency) =>
				changed.has(path.resolve(path.dirname(entry.analysis.filename), dependency))
			)
		) {
			affected.add(path.resolve(entry.inputFile));
		}
	}
	return [...affected];
}
