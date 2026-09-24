import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { ExactBunResolver } from './component-authorization.js';
import type { BunBuildLike } from './types.js';

/**
 * Resolves physical provider edges using the build's conditions and aliases, without evaluation.
 * Bun versions exposing an unimplemented build.resolve use a resolution-only child build.
 * Its loader stops before reading provider source, so authorization still precedes execution.
 * The returned cache belongs to one build generation.
 */
export function createBunBuildResolver(build: BunBuildLike): ExactBunResolver {
	const pending = new Map<string, ReturnType<ExactBunResolver>>();
	let nativeAvailable = Boolean(build.resolve);
	return (request, options) => {
		const key = `${options.resolveDir}\0${request}`;
		let result = pending.get(key);
		if (!result) {
			result = (async () => {
				if (nativeAvailable) {
					try {
						return await build.resolve!(request, options);
					} catch (error) {
						if (
							!(error instanceof Error) ||
							!error.message.includes('build.resolve() is not implemented yet')
						)
							throw error;
						nativeAvailable = false;
					}
				}
				return resolveWithBunBuild(build, request, options.resolveDir);
			})();
			pending.set(key, result);
		}
		return result;
	};
}

/** Uses a separate Bun process because nested builds can deadlock inside an onResolve hook. */
async function resolveWithBunBuild(
	build: BunBuildLike,
	request: string,
	directory: string
): ReturnType<ExactBunResolver> {
	const { stdout } = await promisify(execFile)(
		process.execPath,
		[
			fileURLToPath(
				new URL(
					import.meta.url.endsWith('.ts')
						? './build-resolver-worker.ts'
						: './build-resolver-worker.js',
					import.meta.url
				)
			),
			JSON.stringify({
				request: build.config?.alias?.[request] ?? request,
				directory,
				target: build.config?.target ?? 'bun',
				conditions: build.config?.conditions,
				tsconfig: build.config?.tsconfig
			})
		],
		{ encoding: 'utf8', timeout: 30_000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 }
	);
	const result: unknown = JSON.parse(stdout);
	if (result && typeof result === 'object' && 'missing' in result && result.missing === true)
		throw Object.assign(new Error(`Could not resolve: ${request}`), { code: 'MODULE_NOT_FOUND' });
	if (
		!result ||
		typeof result !== 'object' ||
		!('path' in result) ||
		typeof result.path !== 'string' ||
		!path.isAbsolute(result.path)
	)
		throw new Error(`Bun did not resolve a physical component provider for ${request}`);
	return { path: result.path };
}
