import path from 'node:path';
import {
	withExactHostExecutableSelection,
	exactExplicitBuildSourceFiles,
	exactTestHelperTarget,
	shouldTransformExactBuildModulePath,
	shouldCompileExactBuildModule
} from '@exactjs/compiler/adapter-support';
import type { ExactCompilerSession } from '@exactjs/compiler';
import type { IntlBuildCoordinator } from '@exactjs/intl-build';
import type { ExactPackageEnhancementImport } from '@exactjs/config';
import type { ExactBunPluginOptions } from '../types.js';
import { shouldTransform, targetFor } from '../selection.js';
import type { createBunBuildResolver } from '../build-resolver.js';
import type { ExactBunSourcePreparation } from './preparation.js';

/** Uses Bun's real import resolver and keeps preparation plus dependent work in one queue slot. */
export function withExactBunSourceSelection<Result>(
	source: string,
	filename: string,
	options: ExactBunPluginOptions,
	session: ExactCompilerSession,
	sourceRoot: string,
	packageEnhancements: readonly ExactPackageEnhancementImport[],
	intl: IntlBuildCoordinator,
	preparation: ExactBunSourcePreparation,
	resolveProvider: ReturnType<typeof createBunBuildResolver>,
	invalidate: () => void,
	run: (
		prepared: ReturnType<ExactBunSourcePreparation['prepare']> | undefined,
		target: 'client' | 'server'
	) => Result | Promise<Result>
) {
	return withExactHostExecutableSelection(
		session,
		() => {
			invalidate();
			if (options.__exactTestHost)
				options = {
					...options,
					target: exactTestHelperTarget(
						source,
						{ filename, root: options.applicationRoot, session },
						targetFor(options)
					)
				};
			return {
				filename,
				source,
				target: targetFor(options),
				sourceRoot,
				additionalSourceFiles: exactExplicitBuildSourceFiles(options),
				selectSource: shouldCompileExactBuildModule(filename, source, options),
				packageEnhancements,
				prepare: (source, filename, target) => {
					const prepared = preparation.prepare(
						source,
						filename,
						target,
						options,
						intl,
						console.warn,
						shouldTransform(filename, source, options)
					);
					return {
						source: prepared.analyzedSource,
						prepared,
						privateSource:
							prepared.ownership !== 'react' &&
							shouldTransformExactBuildModulePath(filename, options)
					};
				},
				resolve: async (specifier: string, importer: string, kind: 'import' | 'require') => {
					// The existing resolver owns import statements only. Require stays opaque.
					if (kind === 'require') return undefined;
					const result = await resolveProvider(specifier, {
						kind: 'import-statement',
						resolveDir: path.dirname(importer)
					});
					return { id: result.path };
				}
			};
		},
		(target, prepared) => run(prepared, target)
	);
}
