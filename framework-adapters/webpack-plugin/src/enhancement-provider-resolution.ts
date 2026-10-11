import path from 'node:path';
import type { WebpackCompilerLike } from './plugin.js';

/** The owning Webpack resolver decides whether Node-missing source providers exist in this build. */
export function createWebpackEnhancementResolver(compiler: WebpackCompilerLike) {
	return (request: string, importer: string): string | undefined => {
		const resolver = compiler.resolverFactory?.get?.('normal', {
			dependencyType: 'esm',
			useSyncFileSystemCalls: true
		});
		if (!resolver?.resolveSync) return undefined;
		try {
			const resolved = resolver.resolveSync({}, path.dirname(importer), request);
			return typeof resolved === 'string' ? resolved : undefined;
		} catch (error) {
			// Node already proved an optional missing root. Preserve that absence only when
			// the host also reports that same unresolved request, rather than an operational failure.
			if (error instanceof Error && error.message.startsWith(`Can't resolve '${request}' in `))
				return undefined;
			throw error;
		}
	};
}
