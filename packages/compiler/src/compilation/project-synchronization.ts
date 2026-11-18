import type { NativeExecutableSelection } from '../native/process-executable-selection.js';
import { readFile } from 'node:fs/promises';
import type { ExactCompilerSession } from '../expression/project.js';
import type { TransformOptions } from '../types.js';
import { preparePackageEnhancementSource } from './package-enhancements.js';

/**
 * Installs the prepared source batch in one native program generation.
 * The caller retains ownership of the session and source collection. Supplying executable
 * selection requires a matching native acknowledgement before dependent analysis or lowering.
 * Ordinary unselected batches add or update authoritative source overlays, including virtual
 * sources. Omission does not discard a previously installed overlay. Explicit session reset
 * clears that retained source authority. Selected sessions require complete replacement
 * snapshots until the session is reset.
 */
export async function synchronizeNativeProject(
	filenames: readonly string[],
	options: Readonly<
		Pick<TransformOptions, 'root' | 'configFile' | 'packageEnhancements'> & {
			session?: ExactCompilerSession;
			/** Host-resolved executable edges for this complete prepared batch. */
			executableSelection?: NativeExecutableSelection;
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
		executableSelection: options.executableSelection,
		root: options.root,
		configFile: options.configFile,
		sources: [...sources].map(([id, source]) => {
			const prepared = preparePackageEnhancementSource(
				source,
				id,
				options.packageEnhancements,
				options.root
			);
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
