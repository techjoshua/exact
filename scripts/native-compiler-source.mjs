import { access } from 'node:fs/promises';
import path from 'node:path';

/**
 * Resolves the TypeScript-Go source used to build the native compiler.
 *
 * Explicit command-line and environment paths remain caller-owned and are
 * validated by the build. Without an override, the pinned source is checked
 * out once at the repository's conventional temporary location and then
 * reused by later builds.
 */
export async function prepareNativeCompilerSource({
	explicitSource,
	repositoryRoot,
	checkout,
	sourceExists = pathExists
}) {
	if (explicitSource) return path.resolve(explicitSource);

	const defaultSource = path.join(repositoryRoot, '.tmp', 'typescript-go-source');
	if (!(await sourceExists(path.join(defaultSource, '.git')))) {
		console.log(`Checking out the pinned TypeScript-Go source at ${defaultSource}`);
		await checkout(defaultSource);
	}
	return defaultSource;
}

async function pathExists(filename) {
	try {
		await access(filename);
		return true;
	} catch (error) {
		if (error?.code === 'ENOENT') return false;
		throw error;
	}
}
