import { shouldCompileExactBuildModule } from '@exactjs/compiler/adapter-support';
import type { ExactWebpackPluginOptions } from './plugin.js';

/** Resolves the compiler target used by a webpack transform. */
export function webpackTransformTarget(options: ExactWebpackPluginOptions): 'client' | 'server' {
	return options.target === 'server' ? 'server' : 'client';
}

/** Reports whether a webpack module is owned by the eXact transform. */
export function shouldTransformWebpackModule(
	id: string,
	code: string,
	options: ExactWebpackPluginOptions
): boolean {
	return shouldCompileExactBuildModule(id, code, {
		...options,
		compileTestModules: true
	});
}
