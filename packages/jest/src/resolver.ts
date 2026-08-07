import { readFileSync } from 'node:fs';
import {
	exactJestAuthorizationCacheEnvironment,
	exactJestResolutionKey,
	type ExactJestAuthorizationCache
} from './authorization-cache.js';

type JestResolverOptions = Readonly<{
	basedir: string;
	defaultResolver(request: string, options: JestResolverOptions): string;
}>;

/** Resolves preflighted component candidates only to the immutable authorized module identity. */
export default function exactJestResolver(request: string, options: JestResolverOptions): string {
	const cache = readAuthorizationCache();
	const authorized = cache?.resolutions[exactJestResolutionKey(options.basedir, request)];
	return authorized ?? options.defaultResolver(request, options);
}

/** Jest 30 resolver object entry for loaders that retain the ESM module namespace. */
export const sync = exactJestResolver;

function readAuthorizationCache(): ExactJestAuthorizationCache | undefined {
	const filename = process.env[exactJestAuthorizationCacheEnvironment];
	if (!filename) return undefined;
	const cache = JSON.parse(readFileSync(filename, 'utf8')) as ExactJestAuthorizationCache;
	if (cache.protocol !== 1) throw new Error('Unsupported eXact Jest authorization cache protocol');
	return cache;
}
