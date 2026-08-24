import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRequire = createRequire(import.meta.url);

/** Returns the platform package expected to contain the native compiler host. */
export function nativeCompilerPlatformPackage(
	platform = process.platform,
	arch = process.arch
): string {
	return `@exactjs/compiler-native-${platform}-${arch}`;
}

/**
 * Resolves the native compiler shipped for the current platform.
 *
 * An explicit environment override supports development and hermetic build
 * systems. Language tools may supply an owning project root so the editor uses
 * that project's npm-selected platform package. Other published installations
 * resolve their own optional platform package; repository checkouts additionally
 * recognize the output of the native build script.
 */
export function resolveNativeCompilerExecutable(from?: string): string {
	const override = process.env.EXACT_COMPILER_EXECUTABLE;
	if (override) return requireExecutable(path.resolve(override), 'EXACT_COMPILER_EXECUTABLE');
	const legacyOverride = process.env.EXACT_NATIVE_COMPILER;
	if (legacyOverride)
		return requireExecutable(path.resolve(legacyOverride), 'EXACT_NATIVE_COMPILER');
	const packageName = nativeCompilerPlatformPackage();
	const filename = process.platform === 'win32' ? 'exactc.exe' : 'exactc';

	if (from) {
		try {
			const workspaceRequire = createRequire(path.join(path.resolve(from), 'package.json'));
			return workspaceRequire.resolve(`${packageName}/${filename}`);
		} catch {
			// Continue to repository and package-local development fallbacks.
		}
	}

	const repositoryCandidate = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		'../../../..',
		'.tmp',
		'native-compiler',
		filename
	);
	if (fs.existsSync(repositoryCandidate)) return repositoryCandidate;

	try {
		return packageRequire.resolve(`${packageName}/${filename}`);
	} catch {
		// The platform package is optional so package managers can select one executable.
	}

	throw new Error(
		`The eXact native compiler for ${process.platform}-${process.arch} is not installed. ` +
			`Install ${packageName} or set EXACT_COMPILER_EXECUTABLE to an exactc executable.`
	);
}

function requireExecutable(filename: string, source: string): string {
	if (fs.existsSync(filename)) return filename;
	throw new Error(`${source} points to a missing native compiler executable: ${filename}`);
}
