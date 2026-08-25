import { exact } from '@exactjs/vite-plugin';
import { fileURLToPath } from 'node:url';
import type { Plugin, UserConfig } from 'vite';

/** Creates one target-local eXact SSR build without sharing runtime-only entry capabilities. */
export function exactServerBuild(entry: URL, outDir: string, entryFileName: string): UserConfig {
	return {
		root: fileURLToPath(new URL('.', import.meta.url)),
		plugins: [
			exact({ target: 'server', renderMode: 'server-render' }),
			rejectUnusedServerContexts()
		],
		build: {
			ssr: fileURLToPath(entry),
			outDir,
			emptyOutDir: true,
			rollupOptions: { output: { entryFileNames: entryFileName } }
		}
	};
}

/** Prevents request-only SSR plumbing from retaining an unused compiled context provider. */
function rejectUnusedServerContexts(): Plugin {
	return {
		name: 'exact-comparison-server-context-ownership',
		generateBundle(_options, bundle) {
			const modules = Object.values(bundle).flatMap((output) =>
				output.type === 'chunk'
					? Object.entries(output.modules)
							.filter(([, details]) => details.renderedLength > 0)
							.map(([id]) => id)
					: []
			);
			const retained = modules.find((id) =>
				/[\\/]packages[\\/]core[\\/](?:src|dist)[\\/]component[\\/]context-(?:api|capability-integration|inspection)\.(?:ts|js)$/.test(
					id
				)
			);
			if (retained)
				throw new Error(`Context-free eXact server bundle retained context traversal: ${retained}`);
		}
	};
}
