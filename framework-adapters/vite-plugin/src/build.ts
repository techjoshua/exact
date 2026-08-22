import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { withExactViteBuildCompilerScope } from './compiler-session.js';

/** Options for one sequential client/server Vite build generation. */
export type ExactViteApplicationBuildOptions = Readonly<{
	/** Vite logging level shared by every config. Defaults to Vite's normal `info` output. */
	logLevel?: 'info' | 'warn' | 'error' | 'silent';
}>;

/**
 * Builds client/server Vite configs sequentially in one process and native compiler project scope.
 * Config paths resolve using Vite's ordinary current-working-directory rules.
 */
export async function buildExactViteApplication(
	configFiles: readonly string[],
	options: ExactViteApplicationBuildOptions = {}
): Promise<void> {
	if (!configFiles.length) throw new Error('At least one eXact Vite config file is required');
	const build = await applicationViteBuild();
	await withExactViteBuildCompilerScope(async () => {
		for (const configFile of configFiles) {
			await build({
				configFile,
				...(options.logLevel ? { logLevel: options.logLevel } : {})
			});
		}
	});
}

/** Resolves the application-owned Vite peer instead of this package's development dependency. */
async function applicationViteBuild(): Promise<(typeof import('vite'))['build']> {
	const applicationRequire = createRequire(path.join(process.cwd(), 'package.json'));
	const entry = applicationRequire.resolve('vite');
	return ((await import(pathToFileURL(entry).href)) as typeof import('vite')).build;
}
