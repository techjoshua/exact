import type { ExactWebpackDebugOptions } from './plugin.js';

/** Resolves an individual compiler control outside Webpack build lifecycle. */
export function webpackDebugEnabled(value: boolean | 'auto' | undefined): boolean {
	return (
		value === true ||
		((value === undefined || value === 'auto') && process.env.NODE_ENV !== 'production')
	);
}

/** Resolves Webpack's independent catalog and runtime controls for one compilation. */
export function resolveWebpackDebug(
	debug: ExactWebpackDebugOptions | undefined,
	development: boolean
): ExactWebpackDebugOptions {
	return {
		...debug,
		catalog:
			debug?.catalog === 'auto' || debug?.catalog === undefined ? development : debug.catalog,
		runtime:
			debug?.runtime === 'auto' || debug?.runtime === undefined ? development : debug.runtime,
		...(development && !debug?.buildKey ? { buildKey: 'development' } : {})
	};
}

/** Appends the guarded client runtime installation to one compiled module. */
export function appendWebpackDevtoolsBootstrap(
	code: string,
	debug: ExactWebpackDebugOptions | undefined
): string {
	let local = '__exactInstallDevtoolsRuntime';
	while (code.includes(local)) local += '_';
	return `${code}
import { installExactDevtoolsRuntime as ${local} } from '@exactjs/devtools-runtime';
globalThis[Symbol.for('@exactjs/devtools-installation')] ??= ${local}(${JSON.stringify({
		buildKey: debug?.buildKey ?? 'development',
		executionRoot: debug?.executionRoot ?? debug?.rootComponentId ?? 'page',
		...(debug?.redactions ? { redactions: debug.redactions } : {})
	})});
`;
}
