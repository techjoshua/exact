import { rm } from 'node:fs/promises';
import { exactJestAuthorizationCacheEnvironment } from './authorization-cache.js';

/** Deletes the immutable authorization generation after all Jest workers have stopped. */
export default async function exactJestGlobalTeardown(): Promise<void> {
	const filename = process.env[exactJestAuthorizationCacheEnvironment];
	delete process.env[exactJestAuthorizationCacheEnvironment];
	if (filename) await rm(filename, { force: true });
}
