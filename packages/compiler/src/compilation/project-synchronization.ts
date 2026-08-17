import { readFile } from 'node:fs/promises';
import type { ExactCompilerSession } from '../expression/project.js';
import type { TransformOptions } from '../types.js';
import { preparePackageEnhancementSource } from './package-enhancements.js';

/**
 * Installs a complete prepared source set in one native program generation.
 * The caller retains ownership of the session and source collection.
 */
export async function synchronizeNativeProject(
	filenames: readonly string[],
	options: Readonly<
		Pick<TransformOptions, 'root' | 'configFile' | 'packageEnhancements'> & {
			session?: ExactCompilerSession;
		}
	>,
	knownSources?: ReadonlyMap<string, string>
): Promise<ReadonlyMap<string, string>> {
	if (!options.session || filenames.length === 0) return knownSources ?? new Map();
	const sources = new Map<string, string>();
	for (const filename of filenames) {
		const source = knownSources?.get(filename) ?? (await readFile(filename, 'utf8'));
		sources.set(filename, source);
	}
	const response = options.session.compileNative({
		kind: 'synchronize',
		root: options.root,
		configFile: options.configFile,
		sources: [...sources].map(([id, source]) => {
			const prepared = preparePackageEnhancementSource(source, id, options.packageEnhancements);
			return {
				id,
				source: prepared.source,
				...(prepared.moduleSpecifiers.size
					? { packageEnhancementBoundary: prepared.authoredLength }
					: {})
			};
		})
	});
	if (response.error) throw new Error(`Native project synchronization failed: ${response.error}`);
	const errors = response.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
	if (errors.length)
		throw new Error(
			`Native project synchronization failed:\n${errors
				.map((diagnostic) => `${diagnostic.code} ${diagnostic.message}`)
				.join('\n')}`
		);
	return sources;
}
