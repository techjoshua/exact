import path from 'node:path';
import { BunResolutionWorker } from './resolution-worker.js';
import type { ExactBunResolver } from './component-authorization.js';
import type { BunBuildLike } from './types.js';

/**
 * Resolves physical provider edges using the build's conditions and aliases, without evaluation.
 * Bun versions exposing an unimplemented build.resolve use a resolution-only child build.
 * Its loader stops before reading provider source, so authorization still precedes execution.
 * The returned cache belongs to one build generation.
 */
export function createBunBuildResolver(
	build: BunBuildLike
): ExactBunResolver & { dispose(): Promise<void> } {
	const worker = new BunResolutionWorker();
	let disposed = false;
	const pending = new Map<string, ReturnType<ExactBunResolver>>();
	let nativeAvailable = Boolean(build.resolve);
	const resolver: ExactBunResolver = (request, options) => {
		if (disposed) return Promise.reject(new Error('Bun build resolver is disposed'));
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
				return resolveWithBunBuild(worker, build, request, options.resolveDir);
			})();
			pending.set(key, result);
		}
		return result;
	};
	return Object.assign(resolver, {
		dispose: async () => {
			disposed = true;
			pending.clear();
			await worker.dispose();
		}
	});
}

/** Uses a separate Bun process because nested builds can deadlock inside an onResolve hook. */
async function resolveWithBunBuild(
	worker: BunResolutionWorker,
	build: BunBuildLike,
	request: string,
	directory: string
): ReturnType<ExactBunResolver> {
	const result = await worker.resolve({
		request: build.config?.alias?.[request] ?? request,
		directory,
		target: build.config?.target ?? 'bun',
		conditions: build.config?.conditions,
		tsconfig: build.config?.tsconfig
	});
	if (result && typeof result === 'object' && 'error' in result)
		throw new Error(String(result.error));
	if (result && typeof result === 'object' && 'missing' in result && result.missing === true)
		throw Object.assign(new Error(`Cannot find module '${request}'`), { code: 'MODULE_NOT_FOUND' });
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
