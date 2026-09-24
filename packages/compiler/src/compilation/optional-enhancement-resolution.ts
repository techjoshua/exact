import { lstat } from 'node:fs/promises';
import path from 'node:path';

/** Distinguishes an absent requested provider from broken exports or a missing nested dependency. */
export function isMissingExactOptionalEnhancement(error: unknown, request: string): boolean {
	if (!(error instanceof Error)) return false;
	const code = (error as Error & { code?: string }).code;
	return (
		(code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') &&
		["'", '"'].some((quote) =>
			['Cannot find module ', 'Cannot find package ', 'Could not resolve '].some((prefix) =>
				error.message.includes(`${prefix}${quote}${request}${quote}`)
			)
		)
	);
}

/**
 * Confirms absence in a Node-style package tree after the host resolver reports a missing request.
 * Installed packages (including dangling links), non-package requests, and filesystem failures
 * must not be mistaken for an unavailable optional provider.
 */
export async function isExactOptionalEnhancementPackageAbsent(
	request: string,
	directory: string
): Promise<boolean> {
	if (
		request.startsWith('.') ||
		path.isAbsolute(request) ||
		request.startsWith('#') ||
		request.includes(':')
	)
		return false;
	const packageName = request
		.split('/')
		.slice(0, request.startsWith('@') ? 2 : 1)
		.join('/');
	for (let parent = path.resolve(directory); ; parent = path.dirname(parent)) {
		try {
			await lstat(path.join(parent, 'node_modules', packageName));
			return false;
		} catch (error) {
			if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT')
				throw error;
		}
		if (path.dirname(parent) === parent) return true;
	}
}
