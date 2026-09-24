import {
	isMissingExactOptionalEnhancement,
	isExactOptionalEnhancementPackageAbsent
} from '@exactjs/compiler/adapter-support';
import path from 'node:path';
import type { ExactWebpackComponentResolver } from './sessions.js';

/** Minimal enhanced-resolve contract used for published component graph preflight. */
export type WebpackNormalResolver = Readonly<{
	resolve(
		contextInfo: Record<string, unknown>,
		context: string,
		request: string,
		resolveContext: Record<string, unknown>,
		callback: (error?: Error | null, result?: string | false) => void
	): void;
}>;

/** Adapts Webpack's normal resolver to the shared async component-edge resolver contract. */
export function createWebpackPublishedComponentResolver(
	resolver: WebpackNormalResolver | undefined
): ExactWebpackComponentResolver | undefined {
	if (!resolver) return undefined;
	return (request, importerModuleId) =>
		new Promise((resolve, reject) => {
			resolver.resolve({}, path.dirname(importerModuleId), request, {}, (error, result) => {
				if (error) reject(error);
				else if (typeof result === 'string') resolve(result);
				else reject(new Error(`Webpack could not resolve published component request ${request}`));
			});
		});
}

/** Recognizes host missing-request errors only when the optional package is actually absent. */
export async function isMissingWebpackOptionalEnhancement(
	error: unknown,
	request: string,
	importerModuleId: string
): Promise<boolean> {
	const normalized =
		error instanceof Error && error.message.startsWith(`Can't resolve '${request}'`)
			? Object.assign(new Error(`Cannot find module '${request}'`, { cause: error }), {
					code: 'MODULE_NOT_FOUND'
				})
			: error;
	return (
		isMissingExactOptionalEnhancement(normalized, request) &&
		(await isExactOptionalEnhancementPackageAbsent(request, path.dirname(importerModuleId)))
	);
}
