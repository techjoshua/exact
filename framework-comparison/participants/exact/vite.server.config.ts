import { exact } from '@exactjs/vite-plugin';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/** Builds the eXact server-rendering entry independently from its browser artifact. */
export default {
	root: fileURLToPath(new URL('.', import.meta.url)),
	plugins: [exact({ target: 'server', renderMode: 'server-render' }), rejectUnusedServerContexts()],
	build: {
		ssr: 'src/server-entry.tsx',
		outDir: 'dist-server',
		emptyOutDir: true,
		rollupOptions: { output: { entryFileNames: 'server-entry.js' } }
	}
};

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
