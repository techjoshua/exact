import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

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
 * systems. Published installations resolve their optional platform package;
 * repository checkouts additionally recognize the output of the native build
 * script.
 */
export function resolveNativeCompilerExecutable(): string {
	const override = process.env.EXACT_NATIVE_COMPILER;
	if (override) return requireExecutable(path.resolve(override), 'EXACT_NATIVE_COMPILER');

	const filename = process.platform === 'win32' ? 'exactc-native.exe' : 'exactc-native';
	const repositoryCandidate = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		'../../../..',
		'.tmp',
		'native-compiler',
		filename
	);
	if (fs.existsSync(repositoryCandidate)) return repositoryCandidate;

	const packageName = nativeCompilerPlatformPackage();
	try {
		return require.resolve(`${packageName}/${filename}`);
	} catch {
		// The platform package is optional so package managers can select one executable.
	}

	throw new Error(
		`The eXact native compiler for ${process.platform}-${process.arch} is not installed. ` +
			`Install ${packageName} or set EXACT_NATIVE_COMPILER to an exactc-native executable.`
	);
}

function requireExecutable(filename: string, source: string): string {
	if (fs.existsSync(filename)) return filename;
	throw new Error(`${source} points to a missing native compiler executable: ${filename}`);
}
