import { resolveExactArtifactImport } from '@exactjs/compiler';
import { shouldCompileExactBuildModule } from '@exactjs/compiler/adapter-support';
import type { ExactBunPluginOptions } from './plugin.js';

/** Resolves the exact artifact target owned by a Bun build. */
export function targetFor(options: ExactBunPluginOptions): 'client' | 'server' {
	return options.target === 'server' ? 'server' : 'client';
}

/** Resolves a Bun import request for a .exact facade to a target artifact. */
export function resolveExactBunRequest(
	request: string,
	importer: string | undefined,
	options: ExactBunPluginOptions = {}
): string | null {
	return resolveExactArtifactImport(request, importer, targetFor(options))?.id ?? null;
}

/** Prepends eXact export conditions without duplicating existing conditions. */
export function mergeConditions(current: readonly string[], next: readonly string[]): string[] {
	return [...next, ...current.filter((condition) => !next.includes(condition))];
}

/** Decides whether one Bun-loaded module belongs to compiler transformation. */
export function shouldTransform(id: string, code: string, options: ExactBunPluginOptions): boolean {
	return shouldCompileExactBuildModule(id, code, options);
}
