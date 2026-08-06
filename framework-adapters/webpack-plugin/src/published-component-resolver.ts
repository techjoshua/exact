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
